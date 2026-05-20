import { createDeepAgent } from 'deepagents';
import { MemorySaver } from "@langchain/langgraph";
import { z } from 'zod';

const checkpointer = new MemorySaver();

const AgentInvokeContextSchema = z.object({
	user: z.object({
		username: z.string().nullable(),
		home_dir: z.string().nullable(),
	}),
    desktop: z.object({
        mode: z.enum(['ambient', 'interactive']),
        window_display_mode: z.enum([
            'all_visible',
            'active_and_focused_only',
            'all_semi_transparent',
            'all_transparent',
        ]),
        screen_width: z.number(),
        screen_height: z.number(),
        available_screen_width: z.number(),
        available_screen_height: z.number(),
        viewport_width: z.number(),
        viewport_height: z.number(),
        viewport_center_x: z.number(),
        viewport_center_y: z.number(),
        device_pixel_ratio: z.number(),
        cursor_x: z.number(),
        cursor_y: z.number(),
        focused_window_uid: z.string().nullable(),
        active_window_uid: z.string().nullable(),
    }),
});

import resolveAgentTools from './agent-tools';
import AgentMiddlewares from './agent-middlewares';
import SingletonAgentBackend from './agent-backend';
import {
	AGENT_STORE_MEMORY_ROUTE_PREFIX,
	AGENT_STORE_TOOL_RESULTS_ROUTE_PREFIX,
    AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX,
    AGENT_FILESYSTEM_HOME_ROUTE_PREFIX,
} from './agent-backend';

function resolveAllowedFilesystemPaths(prefix: string | null) {
    if (!prefix) {
        return [] as string[];
    }

    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return [normalizedPrefix, `${prefix}**`];
}

export default class SingletonAgentInstance {
    private static _instance: SingletonAgentInstance;
    private static _value: ReturnType<typeof createDeepAgent> | null = null;

    private static ensureValue() {
		if (!SingletonAgentInstance._value) {
            const permissions = [
                {
                    operations: ['read', 'write'] as const,
                    paths: resolveAllowedFilesystemPaths(AGENT_STORE_MEMORY_ROUTE_PREFIX),
                    mode: 'allow' as const,
                },
                {
                    operations: ['read', 'write'] as const,
                    paths: resolveAllowedFilesystemPaths(AGENT_STORE_TOOL_RESULTS_ROUTE_PREFIX),
                    mode: 'allow' as const,
                },
                {
                    operations: ['read', 'write'] as const,
                    paths: resolveAllowedFilesystemPaths(AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX),
                    mode: 'allow' as const,
                },
                {
                    operations: ['read', 'write'] as const,
                    paths: resolveAllowedFilesystemPaths(AGENT_FILESYSTEM_HOME_ROUTE_PREFIX),
                    mode: 'allow' as const,
                },
            ].filter((permission) => permission.paths.length > 0);

			SingletonAgentInstance._value = createDeepAgent({
				/** Default Model */
				model: 'openai:gpt-4o-mini',

				/** Prompts */
				systemPrompt: `You are an assistant integrated in Ace, a collaborative coding environment. Your task is to assist users with their coding needs, 
  providing accurate and helpful responses based on the context of the conversation and the code they are working on. 
    Always consider the user's intent and the current state of their project when formulating your responses.

    When you use tools, especially filesystem and CLI-style tools such as ls, glob, grep, read_file, write_file, edit_file, and execute:
    - do not repeat the raw tool output line-by-line in your assistant reply
    - do not dump long file listings, grep matches, or file contents again if the tool already returned them
    - respond with a concise summary of what the tool result means, what was found, or what changed
    - when useful, mention only the key path, count, status, or next implication
    - if detailed output is already available from the tool result, prefer a short summary like "I found 12 matches" or "I listed the directory contents" instead of reproducing the full result
    - only restate full raw output when the user explicitly asks for the exact output

                    When a task requires coordinated edits across many files or many repeated transformations:
                    - prefer generating a temporary shell script or command sequence to perform the bulk change consistently
                    - run the script or command, inspect the result, and clean up the temporary script afterward
                    - prefer this scripted workflow over manually editing a large number of files one by one

    Treat tool outputs as the primary detailed source of truth, and treat your assistant message after a tool call as a concise interpretation or summary.

    You may also receive runtime desktop context describing the current screen resolution, viewport size, viewport center point, cursor position, and focused window state. Use that context when the user asks for spatial actions such as centering, aligning, moving, resizing, or positioning windows/elements on screen.`,

				/** Tools*/
				tools: resolveAgentTools(),

				/** Middlewares*/
				middleware: AgentMiddlewares,

                /** Runtime invoke context */
                contextSchema: AgentInvokeContextSchema,

				/** Checkpointer */
				checkpointer,

				/** Backend for agent runtime storing in file mechanism.. */
				backend: SingletonAgentBackend.getInstance().value,

                /**
                 * Temporary MVP stance:
                 * allow read/write access on every mounted route, including the routed home filesystem path.
                 * DeepAgents does not enforce permissions on `execute`, so command execution remains available
                 * as long as the backend exposes execution support.
                 */
                permissions,
            }) as unknown as ReturnType<typeof createDeepAgent>;
		}

		return SingletonAgentInstance._value;
    }

    private constructor() {}

    public get value(): ReturnType<typeof createDeepAgent> {
		return SingletonAgentInstance.ensureValue() as ReturnType<typeof createDeepAgent>;
    }

    public stream(
        state: Parameters<ReturnType<typeof createDeepAgent>['invoke']>[0],
        config: Record<string, unknown> & { version: 'v3' },
    ) {
        return this.value.streamEvents(state as never, config as never);
    }

    public static getInstance(): SingletonAgentInstance {
        if (!SingletonAgentInstance._instance) {
            SingletonAgentInstance._instance = new SingletonAgentInstance();
        }
        return SingletonAgentInstance._instance;
    }
}
