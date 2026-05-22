import type { StructuredToolInterface } from '@langchain/core/tools';
import { resolveAgentToolsFromRegistry } from './agent-tool-registry';
import resolveShellTools from './tools/resolve-shell';

export default function resolveAgentTools() {
    const toolsByName = new Map<string, StructuredToolInterface>();

    for (const tool of [...resolveShellTools(), ...resolveAgentToolsFromRegistry()]) {
        toolsByName.set(tool.name, tool);
    }

    return Array.from(toolsByName.values());
}
