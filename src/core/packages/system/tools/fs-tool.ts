import { z } from 'zod';
import type { AceRegistryType } from '#/schemas/registry-types';
import type { ToolChatPreview, ToolDefinition } from '#/schemas/tooling';
import { FSEngine } from '#/services/fs-engine';

function buildFsToolPreview(result: Record<string, unknown>): ToolChatPreview | null {
    const action = typeof result.action === 'string' ? result.action : '';
    const path = typeof result.path === 'string' ? result.path : '';
    const absolutePath = typeof result.absolute_path === 'string' ? result.absolute_path : '';
    const subtitle = absolutePath || path || undefined;

    if (action === 'read_file') {
        const content = typeof result.content === 'string' ? result.content : '';
        return {
            title: 'fs_tool · read_file',
            subtitle,
            code_block: content
                ? {
                    content,
                }
                : undefined,
        };
    }

    if (action === 'list_directory') {
        const items = Array.isArray(result.items) ? result.items : [];
        return {
            title: 'fs_tool · list_directory',
            subtitle,
            list_items: items.slice(0, 8).map((item, index) => {
                const entry = item && typeof item === 'object' && !Array.isArray(item)
                    ? item as Record<string, unknown>
                    : {};
                const name = typeof entry.name === 'string' ? entry.name : `item-${index + 1}`;
                const isDirectory = entry.is_directory === true;
                return {
                    label: name,
                    badge: isDirectory ? 'DIR' : 'FILE',
                };
            }),
        };
    }

    if (action === 'write_file' || action === 'create_directory' || action === 'delete_file') {
        return {
            title: `fs_tool · ${action}`,
            subtitle,
            lines: [subtitle ?? path].filter((line): line is string => Boolean(line)),
        };
    }

    return null;
}

// -----------------------------------------------------------------------
// Registry identity — one tool entry for AI context:
//   "fs_tool: manages files and directories inside the AppConfig directory"
// Sub-actions (action field) cover all FS operations.
// -----------------------------------------------------------------------
export const registry: AceRegistryType.Tool = {
    name: 'fs_tool',
    slug: 'fs-tool',
    description: 'Manage files in AppConfig or inside the current user home directory via ~/ or absolute home paths.',
    parameters: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                description: 'Operation to perform.',
                enum: ['read_file', 'write_file', 'list_directory', 'create_directory', 'delete_file'],
            },
            path: {
                type: 'string',
                description: 'Relative path for AppConfig, or ~/... / absolute path inside the current user home directory.',
            },
            content: {
                type: 'string',
                description: 'Text content to write. Required for write_file.',
            },
        },
        required: ['action', 'path'],
    },
};

// -----------------------------------------------------------------------
// Zod schema — discriminated union per action
// -----------------------------------------------------------------------
const Schema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('read_file'),
        path: z.string().min(1),
    }),
    z.object({
        action: z.literal('write_file'),
        path: z.string().min(1),
        content: z.string(),
    }),
    z.object({
        action: z.literal('list_directory'),
        path: z.string().min(1),
    }),
    z.object({
        action: z.literal('create_directory'),
        path: z.string().min(1),
    }),
    z.object({
        action: z.literal('delete_file'),
        path: z.string().min(1),
    }),
]);

// -----------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------
const toolDef: ToolDefinition<typeof Schema> = {
    name: 'fs_tool',
    description: 'Manage files in AppConfig or inside the current user home directory via ~/ or absolute home paths.',
    schema: Schema,
    buildChatPreview: ({ result }) => buildFsToolPreview(result),
    handler: async (args) => {
        switch (args.action) {
            case 'read_file': {
                const text = await FSEngine.readRaw(args.path);
                if (text === null) throw new Error(`fs_tool: file not found: ${args.path}`);
                const absolute_path = await FSEngine.resolvePath(args.path);
                return { action: 'read_file', path: args.path, absolute_path, content: text };
            }

            case 'write_file': {
                const ok = await FSEngine.writeFile(args.path, args.content);
                if (!ok) throw new Error(`fs_tool: failed to write: ${args.path}`);
                const absolute_path = await FSEngine.resolvePath(args.path);
                return { action: 'write_file', path: args.path, absolute_path, bytes_written: args.content.length };
            }

            case 'list_directory': {
                const entries = await FSEngine.readDirectory(args.path);
                const items = (entries as any[]).map((e: any) => ({
                    name: e.name,
                    is_directory: e.isDirectory ?? e.children !== undefined,
                }));
                return { action: 'list_directory', path: args.path, items };
            }

            case 'create_directory': {
                const ok = await FSEngine.createDirectory(args.path);
                if (!ok) throw new Error(`fs_tool: failed to create directory: ${args.path}`);
                const absolute_path = await FSEngine.resolvePath(args.path);
                return { action: 'create_directory', path: args.path, absolute_path, created: true };
            }

            case 'delete_file': {
                const ok = await FSEngine.deleteFile(args.path);
                if (!ok) throw new Error(`fs_tool: failed to delete: ${args.path}`);
                const absolute_path = await FSEngine.resolvePath(args.path);
                return { action: 'delete_file', path: args.path, absolute_path, deleted: true };
            }
        }
    },
};

export default toolDef;
