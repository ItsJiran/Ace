import { z } from 'zod';
import type { AceRegistryType } from '#/schemas/registry-types';
import type { ToolChatPreview, ToolDefinition } from '#/schemas/tooling';
import { ShellEngine } from '#/services/shell-engine';

function buildShellToolPreview(result: Record<string, unknown>): ToolChatPreview | null {
    const action = typeof result.action === 'string' ? result.action : 'run';
    const command = typeof result.command === 'string' ? result.command : '';
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    const exitCode = typeof result.exit_code === 'number' ? result.exit_code : undefined;
    const success = result.success === true || action === 'check_available' || action === 'output';

    if (action === 'check_available') {
        return {
            title: 'shell_tool · check_available',
            subtitle: command || undefined,
            lines: [result.available === true ? 'Binary tersedia di PATH.' : 'Binary tidak ditemukan di PATH.'],
        };
    }

    const lines: string[] = [];
    if (exitCode !== undefined) {
        lines.push(`exit code ${exitCode}${success ? ' · success' : ' · failed'}`);
    }

    if (stderr.trim()) {
        lines.push(stderr.trim());
    }

    return {
        title: `shell_tool · ${action}`,
        subtitle: command || undefined,
        lines,
        code_block: stdout.trim()
            ? {
                content: stdout.trim(),
                language: 'bash',
            }
            : undefined,
    };
}

// -----------------------------------------------------------------------
// Registry identity
// -----------------------------------------------------------------------
export const registry: AceRegistryType.Tool = {
    name: 'shell_tool',
    slug: 'shell-tool',
    description:
        'Execute shell commands on the host system via ShellEngine. ' +
        'Use check_available to verify a CLI tool exists before running it.',
    parameters: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                description: 'Operation to perform.',
                enum: ['run', 'run_sudo', 'check_available', 'output'],
            },
            command: {
                type: 'string',
                description: 'Program name (e.g. "git", "ls", "python3").',
            },
            args: {
                type: 'array',
                description: 'Array of string arguments to pass to the program.',
            },
            cwd: {
                type: 'string',
                description: 'Working directory for the command (optional).',
            },
        },
        required: ['action', 'command'],
    },
};

// -----------------------------------------------------------------------
// Schema
// -----------------------------------------------------------------------
const Schema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('run'),
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        cwd: z.string().optional(),
    }),
    z.object({
        action: z.literal('run_sudo'),
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        cwd: z.string().optional(),
    }),
    z.object({
        action: z.literal('output'),
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        cwd: z.string().optional(),
    }),
    z.object({
        action: z.literal('check_available'),
        command: z.string().min(1),
    }),
]);

// -----------------------------------------------------------------------
// Handler — delegates entirely to ShellEngine
// -----------------------------------------------------------------------
const toolDef: ToolDefinition<typeof Schema> = {
    name: 'shell_tool',
    description:
        'Execute shell commands on the host system. run returns full result, ' +
        'output returns trimmed stdout (throws on non-zero exit), ' +
        'check_available checks if a binary is on PATH.',
    schema: Schema,
    buildChatPreview: ({ result }) => buildShellToolPreview(result),
    handler: async (args) => {
        switch (args.action) {
            case 'run':
                return ShellEngine.run(args.command, { args: args.args, cwd: args.cwd });

            case 'run_sudo':
                return ShellEngine.runSudo(args.command, { args: args.args, cwd: args.cwd });

            case 'output':
                return {
                    action: 'output',
                    command: args.command,
                    stdout: await ShellEngine.output(args.command, { args: args.args, cwd: args.cwd }),
                };

            case 'check_available':
                return {
                    action: 'check_available',
                    command: args.command,
                    available: await ShellEngine.checkAvailable(args.command),
                };
        }
    },
};

export default toolDef;
