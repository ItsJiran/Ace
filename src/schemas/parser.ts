import type { AIBlock, AIParserProtocolState } from "./ai";

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

    // Function to send the parsed block response back to the session, 
    // which will then be rendered by the frontend.
    dispatchParserResponse: (detail: AIParserProtocolState) => void;

    // For aborting current connected stream response 
    // if a new prompt is sent let say our block parser need to wait user confirmation 
    // before executing a tool, but user send another prompt instead of confirming, 
    // in that case we need to abort the current stream response 
    // to save resource and tokens.
    abortCurrentResponseBuffer: AbortSignal;
}

export type ParserBlockHandler = (context:ParserBlockArgs) => Promise<void>;

export interface ParserBlockRuntime {
    package_name: string;
    slug: string;
    aliases: string[];
    schema: BlockProtocolSchema;
    handler: ParserBlockHandler;
}
