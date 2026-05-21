
import type { StructuredToolInterface } from '@langchain/core/tools';
import { execFile } from 'child_process';
import { tool as defineTool } from 'langchain';
import path from 'node:path';
import { promisify } from 'util';
import {z} from 'zod';

const execFileAsync = promisify(execFile);
const SHELL_ROOT_DIR = path.resolve(`/home/${process.env.USER ?? 'user'}`);
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 16_000;

function resolveShellWorkingDirectory(workingDirectory?: string) {
    if (!workingDirectory) {
        return SHELL_ROOT_DIR;
    }

    const resolvedWorkingDirectory = path.resolve(SHELL_ROOT_DIR, workingDirectory);
    if (
        resolvedWorkingDirectory === SHELL_ROOT_DIR ||
        resolvedWorkingDirectory.startsWith(`${SHELL_ROOT_DIR}${path.sep}`)
    ) {
        return resolvedWorkingDirectory;
    }

    throw new Error(`Shell working directory must stay within ${SHELL_ROOT_DIR}`);
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

function resolveErrorDetails(error: unknown) {
    if (!error || typeof error !== 'object') {
        return {
            stdout: '',
            stderr: String(error ?? 'Unknown shell error'),
        };
    }

    const shellError = error as {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        message?: string;
    };

    return {
        stdout: typeof shellError.stdout === 'string' ? shellError.stdout : String(shellError.stdout ?? ''),
        stderr:
            typeof shellError.stderr === 'string'
                ? shellError.stderr
                : shellError.message ?? String(shellError.stderr ?? 'Shell execution failed'),
    };
}

type ExecuteToolInput = {
    command: string;
    working_directory?: string | null;
    timeout_ms?: number | null;
    env?: Record<string, string> | null;
    user?: string | null;
};

async function executeShellCommand(action: ExecuteToolInput) {
    if (typeof action.command !== 'string' || !action.command.trim()) {
        return 'No shell command was provided.';
    }

    const currentUser = process.env.USER ?? null;
    if (action.user && currentUser && action.user !== currentUser) {
        return `Refused to run command as ${action.user}. Allowed user: ${currentUser}.`;
    }

    const workingDirectory = resolveShellWorkingDirectory(action.working_directory ?? undefined);
    const timeoutMs = normalizeTimeoutMs(action.timeout_ms ?? undefined);
    const commandPreview = action.command.trim();

    try {
        const { stdout, stderr } = await execFileAsync('/bin/sh', ['-lc', action.command], {
            cwd: workingDirectory,
            env: {
                ...process.env,
                ...(action.env ?? {}),
            },
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
        });

        return truncateOutput([
            `cwd: ${workingDirectory}`,
            `$ ${commandPreview}`,
            stdout ? `stdout:\n${stdout}` : null,
            stderr ? `stderr:\n${stderr}` : null,
        ].filter(Boolean).join('\n\n'));
    } catch (error) {
        const { stdout, stderr } = resolveErrorDetails(error);

        return truncateOutput([
            `cwd: ${workingDirectory}`,
            `$ ${commandPreview}`,
            stdout ? `stdout:\n${stdout}` : null,
            stderr ? `stderr:\n${stderr}` : 'stderr:\nShell execution failed.',
        ].filter(Boolean).join('\n\n'));
    }
}

export default function resolveShellTools() {
    return [
        defineTool(executeShellCommand, {
            name: 'local_shell_tool',
            description:
                'Execute a bash shell command within the local user home directory. Use this for CLI inspection, search, scripts, builds, and diagnostics when filesystem tools are insufficient.',
            schema: z.object({
                command: z.string().min(1).describe('Shell command string to execute.'),
                working_directory: z
                    .string()
                    .optional()
                    .describe(`Optional working directory, restricted to ${SHELL_ROOT_DIR}.`),
                timeout_ms: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe('Optional timeout in milliseconds.'),
                env: z
                    .record(z.string(), z.string())
                    .optional()
                    .describe('Optional environment variables to merge into the process environment.'),
                user: z
                    .string()
                    .optional()
                    .describe('Optional OS user. Must match the current runtime user if provided.'),
            }),
        }) as StructuredToolInterface,
    ];
}