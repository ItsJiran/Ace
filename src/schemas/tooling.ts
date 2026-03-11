import { z } from 'zod';

// ----------------------------------------------------------------------
// Tool Execution Schemas
// These define the structure of requests the Gateway makes to the Client
// to execute OS-level actions (The "Backend" of the Client).
// ----------------------------------------------------------------------

export const ToolCallBaseSchema = z.object({
    /** The unique name of the registered tool */
    tool_name: z.string(),
    /** The parameters required to execute the tool */
    parameters: z.record(z.string(), z.any()),
});

export type ToolCallBase = z.infer<typeof ToolCallBaseSchema>;

// Example: A strict shell command tool definition
export const ShellCommandToolSchema = ToolCallBaseSchema.extend({
    tool_name: z.literal('execute_shell_command'),
    parameters: z.object({
        command: z.string().describe('The strict bash command to run'),
        cwd: z.string().optional().describe('The working directory to run inside'),
        timeout_ms: z.number().default(5000),
    }),
});

// Example: Obsidian Native Integration tool definition
export const ObsidianReadToolSchema = ToolCallBaseSchema.extend({
    tool_name: z.literal('read_obsidian_note'),
    parameters: z.object({
        relative_path: z.string().describe('Path inside the vault, e.g., "Daily/2026-03-10.md"'),
    }),
});
