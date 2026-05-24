import type { StructuredToolInterface } from '@langchain/core/tools';
import { resolveAgentToolsFromRegistry } from './agent-tool-registry';
import createToolFilterMiddleware from './tools/create-tool-filter-middleware';
import { planningExecutionBatchTool, updateExecutionBatchTool } from './tools/execution-batch';
import resolveShellTools from './tools/resolve-shell';

const ORCHESTRATOR_CONTEXT_TOOL_NAMES = [
    'ls',
    'glob',
    'grep',
    'read_file',
    planningExecutionBatchTool.name,
];

function dedupeTools(tools: StructuredToolInterface[]) {
    const toolsByName = new Map<string, StructuredToolInterface>();

    for (const tool of tools) {
        toolsByName.set(tool.name, tool);
    }

    return Array.from(toolsByName.values());
}

function filterToolsByName(tools: StructuredToolInterface[], allowedToolNames: Iterable<string>) {
    const allowed = new Set(allowedToolNames);

    return tools.filter((tool) => allowed.has(tool.name));
}

export function resolveAgentTools() {
    return dedupeTools([...resolveShellTools(), ...resolveAgentToolsFromRegistry()]);
}

export function resolveOrchestratorTools() {
    return dedupeTools([
        ...filterToolsByName(resolveAgentTools(), ORCHESTRATOR_CONTEXT_TOOL_NAMES),
        planningExecutionBatchTool,
    ]);
}

export function resolveExecutionerTools() {
    return dedupeTools([...resolveAgentTools(), updateExecutionBatchTool]);
}

export function resolveCompiledTools() {
    return [updateExecutionBatchTool];
}

export function createOrchestratorToolFilterMiddleware() {
    return createToolFilterMiddleware('OrchestratorToolFilterMiddleware', ORCHESTRATOR_CONTEXT_TOOL_NAMES);
}

export function createCompiledToolFilterMiddleware() {
    return createToolFilterMiddleware('CompiledToolFilterMiddleware', [
        updateExecutionBatchTool.name,
    ]);
}

export default resolveAgentTools;
