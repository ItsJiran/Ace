import { createMiddleware } from 'langchain';

function shouldKeepTool(tool: unknown, allowedToolNames: Set<string>) {
    if (!tool || typeof tool !== 'object' || !('name' in tool) || typeof tool.name !== 'string') {
        return true;
    }

    return allowedToolNames.has(tool.name);
}

export default function createToolFilterMiddleware(name: string, allowedToolNames: Iterable<string>) {
    const allowed = new Set(allowedToolNames);

    return createMiddleware({
        name,
        wrapModelCall: async (request, handler) => {
            return handler({
                ...request,
                tools: (request.tools ?? []).filter((tool) => shouldKeepTool(tool, allowed)),
            });
        },
    });
}