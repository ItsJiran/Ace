import type { ToolDefinition } from '#/schemas/tooling';
import {
    ShellCommandTool
} from '#/schemas/tooling';


class ToolRegistrySingleton {
    private registry: Map<string, ToolDefinition<any>> = new Map();

    constructor() {
        // Register core tools automatically
        this.register(ShellCommandTool);
    }

    /**
     * Registers a new tool into the system.
     * This is polymorphic and supports any tool following the ToolDefinition pattern.
     */
    register(tool: ToolDefinition<any>) {
        if (this.registry.has(tool.name)) {
            console.warn(`ToolRegistry: Overwriting existing tool definition for "${tool.name}"`);
        }
        this.registry.set(tool.name, tool);
        console.log(`ToolRegistry: Registered tool "${tool.name}"`);
    }

    /**
     * Retrieves a tool by its unique name.
     */
    getTool(name: string): ToolDefinition<any> | undefined {
        return this.registry.get(name);
    }

    /**
     * Validates raw parameters against a tool's Zod schema.
     * Use this in the Event Bus before dispatching to the Process Engine.
     */
    validate(toolName: string, parameters: unknown) {
        const tool = this.getTool(toolName);
        if (!tool) {
            throw new Error(`ToolRegistry: Tool "${toolName}" not found.`);
        }

        const result = tool.schema.safeParse(parameters);
        if (!result.success) {
            throw new Error(`ToolRegistry: Validation failed for "${toolName}": ${result.error.message}`);
        }

        return result.data;
    }

    /**
     * Returns all registered tools for AI inspection or UI listing.
     */
    getManifest() {
        return Array.from(this.registry.values()).map(t => ({
            name: t.name,
            description: t.description,
            // Extract the simple JSON schema for the AI if needed
        }));
    }
}

export const ToolRegistry = new ToolRegistrySingleton();
