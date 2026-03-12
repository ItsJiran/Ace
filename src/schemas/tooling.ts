import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';

// ----------------------------------------------------------------------
// 1. THE BASE TYPES (Safe for UI and Backend)
// ----------------------------------------------------------------------

/**
 * Unique identifier for a process instance.
 */
export type ProcessId = string;

/**
 * Core handler signature for all tools.
 * Tools receive their validated parameters and the current process ID.
 */
export type ToolHandler<T> = (args: T, processId: ProcessId) => Promise<any>;

/**
 * Unified Tool Definition Bundle.
 * Combines metadata, schema validation, and execution logic.
 */
export interface ToolDefinition<T extends z.ZodObject<any>> {
    name: string;
    description: string;
    schema: T;
    handler: ToolHandler<z.infer<T>>;
}

// ----------------------------------------------------------------------
// 2. EXAMPLE TOOLS (Obsidian & Shell)
// ----------------------------------------------------------------------

// --- Shell Command Tool ---

export const ShellCommandParameters = z.object({
    command: z.string().describe('The strict bash command to run'),
    cwd: z.string().optional().describe('The working directory to run inside'),
    timeout_ms: z.number().default(5000),
});

export type ShellArgs = z.infer<typeof ShellCommandParameters>;

const executeShellCommand = async (args: ShellArgs, processId: string) => {
    console.log(`[Process ${processId}] Executing shell: ${args.command}`);
    return await invoke('execute_shell_command', {
        command: args.command,
        cwd: args.cwd,
        timeout: args.timeout_ms
    });
};

export const ShellCommandTool: ToolDefinition<typeof ShellCommandParameters> = {
    name: 'execute_shell_command',
    description: 'Executes a strict shell command on the host system.',
    schema: ShellCommandParameters,
    handler: executeShellCommand,
};

