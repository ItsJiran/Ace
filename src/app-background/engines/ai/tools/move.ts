import type { StructuredToolInterface } from '@langchain/core/tools';
import { execFile } from 'child_process';
import { tool as defineTool } from 'langchain';
import path from 'node:path';
import { promisify } from 'util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT_DIR = process.cwd();
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_LENGTH = 8_000;

function resolveWorkspacePath(relativePath: string) {
	const resolvedPath = path.resolve(WORKSPACE_ROOT_DIR, relativePath);
	if (
		resolvedPath === WORKSPACE_ROOT_DIR ||
		resolvedPath.startsWith(`${WORKSPACE_ROOT_DIR}${path.sep}`)
	) {
		return resolvedPath;
	}

	throw new Error(`Move paths must stay within ${WORKSPACE_ROOT_DIR}`);
}

function truncateOutput(value: string) {
	if (value.length <= MAX_OUTPUT_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_OUTPUT_LENGTH)}\n...[truncated]`;
}

function normalizeTimeoutMs(timeoutMs?: number) {
	if (!Number.isFinite(timeoutMs) || !timeoutMs || timeoutMs <= 0) {
		return DEFAULT_TIMEOUT_MS;
	}

	return Math.min(timeoutMs, MAX_TIMEOUT_MS);
}

async function moveWorkspacePath(input: {
	from_path: string;
	to_path: string;
	overwrite?: boolean;
	timeout_ms?: number;
}) {
	const fromPath = resolveWorkspacePath(input.from_path);
	const toPath = resolveWorkspacePath(input.to_path);
	const timeoutMs = normalizeTimeoutMs(input.timeout_ms);
	const commandArgs = [input.overwrite ? '-f' : '-n', fromPath, toPath];

	try {
		const { stdout, stderr } = await execFileAsync('mv', commandArgs, {
			cwd: WORKSPACE_ROOT_DIR,
			timeout: timeoutMs,
			maxBuffer: 1024 * 1024,
			windowsHide: true,
		});

		return truncateOutput(
			[
				`$ mv ${commandArgs.join(' ')}`,
				stdout ? `stdout:\n${stdout}` : null,
				stderr ? `stderr:\n${stderr}` : null,
				`moved: ${input.from_path} -> ${input.to_path}`,
			]
				.filter(Boolean)
				.join('\n\n'),
		);
	} catch (error) {
		const moveError = error as {
			stdout?: string | Buffer;
			stderr?: string | Buffer;
			message?: string;
		};

		return truncateOutput(
			[
				`$ mv ${commandArgs.join(' ')}`,
				typeof moveError.stdout === 'string' && moveError.stdout ? `stdout:\n${moveError.stdout}` : null,
				typeof moveError.stderr === 'string' && moveError.stderr
					? `stderr:\n${moveError.stderr}`
					: `stderr:\n${moveError.message ?? 'Move command failed.'}`,
			]
				.filter(Boolean)
				.join('\n\n'),
		);
	}
}

export default function resolveMoveTools() {
	return [
		defineTool(moveWorkspacePath, {
			name: 'move',
			description:
				'Safely move or rename a file or directory within the workspace by running a constrained mv command.',
			schema: z.object({
				from_path: z.string().min(1).describe('Workspace-relative source path to move.'),
				to_path: z.string().min(1).describe('Workspace-relative destination path to move to.'),
				overwrite: z.boolean().optional().describe('Force overwrite when the destination already exists.'),
				timeout_ms: z.number().int().positive().optional().describe('Optional mv timeout in milliseconds.'),
			}),
		}) as StructuredToolInterface,
	];
}