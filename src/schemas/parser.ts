import type { AIBlock } from "./ai";

export interface BlockProtocolSchema {
    /** Canonical runtime block tag. This must match the parser slug. */
    name: string;
    purpose: string;
    requiredFields?: string;
    optionalFields?: string;
    payloadNote?: string[];
    exampleLines: string[];
    
    /**
     * Trigger conditions: describes WHEN and WHY this block parser is invoked.
     * Used to inform AI context about appropriate block usage patterns.
     * Examples:
     *   - "Called when user requests tool listing or parameter inspection"
     *   - "Triggered automatically after user confirmation for tool execution"
     */
    triggerConditions?: string[];
    
    /**
     * Prompt context examples: sample user/system prompts that should trigger
     * this block type. Helps AI understand natural language intent patterns.
     * Examples:
     *   - "List all available tools in the system"
     *   - "Show me the parameters for the file-search tool"
     */
    promptExamples?: string[];
}

export type ParserBlockArgs = {
    block: AIBlock;
    dispatchParserResponse: (detail: any) => void;
}

export type ParserBlockHandler = (context:ParserBlockArgs) => Promise<void>;

export interface ParserBlockRuntime {
    package_name: string;
    slug: string;
    aliases: string[];
    schema: BlockProtocolSchema;
    handler: ParserBlockHandler;
}
