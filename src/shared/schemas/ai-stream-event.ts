import { ToolMessage } from "langchain";
import { WorkflowNodeNames } from "../../shared/schemas/ai";

/**
 * The reason why I need to redeclare the type is that in the LangGraph documentation, I can't find any clear definition of the event that is emitted in the stream, and 
 * also the event is emitted in a very flexible way, which makes it hard for us to define a clear type for the event. So I decided to 
 * define a clear type for the event based on the actual event that is emitted in the stream, and also based on the actual event that we 
 * need to track in our UI, which is the message event and the tool event.
 */

/**
 * For now i focusing on defining the message stream event, which is the most important event for us to track the token 
 * usage and the content of the message, and also the tool usage event, which is also important for us to track the 
 * tool usage and the content of the tool input and output.
 * 
 * i focus on the message and tool event because they are the most important event for us to track the usage and the content of the message and tool, 
 * which is the most important thing for us to display in the UI and also for us to track the cost of the agent execution.
 */

export type AgentStreamEvent = {
    channel : string;
    type : string;
    seq : number | null;
    data : Record<string, unknown>;
    node : typeof WorkflowNodeNames[keyof typeof WorkflowNodeNames] | null;
}
export type AgentStreamAnyEvent =
    | AgentStreamToolEvent
    | AgentStreamLifecycleEvent
    | AgentStreamMessageEvent;

export type AgentStreamLifecycleEvent =
    | AgentStreamLifecycleStartedEvent
    | AgentStreamLifecycleCompletedEvent
    | AgentStreamLifecycleFailedEvent;

export type AgentStreamToolEvent =
    | AgentStreamToolStartedEvent
    | AgentStreamToolDeltaEvent
    | AgentStreamToolErrorEvent
    | AgentStreamToolFinishedEvent;

export type AgentStreamMessageEvent =
    | AgentStreamMessageStartEvent
    | AgentStreamMessageFinishEvent
    | AgentStreamMessageUsageEvent
    | AgentStreamMessageContentBlockEvent;

/** + -------------- STREAM TOOL ---------------- */

export type AgentStreamToolStartedEvent = AgentStreamEvent & {
    channel: 'tool';
    type: 'tool-started';
    data: {
        tool_call_id: string;
        tool_name: string;
        input : string | Record<string, unknown>;
    }
};

export type AgentStreamToolDeltaEvent = AgentStreamEvent & {
    channel: 'tool';
    type: 'tool-delta';
    data: Record<string, unknown>; // can't find any clear definition, inthe docs it trigger error event but instead in this version langgraph return finished event with content messages.
};

export type AgentStreamToolErrorEvent = AgentStreamEvent & {
    channel: 'tool';
    type: 'tool-error';
    data: Record<string, unknown>; // can't find any clear definition, inthe docs it trigger error event but instead in this version langgraph return finished event with content messages.
};

export type AgentStreamToolFinishedEvent = AgentStreamEvent & {
    channel: 'tool';
    type: 'tool-finished';
    data: {
        tool_call_id : string;
        // tool_name : string; // this is the tool name, 
        output : ToolMessage;
    }
};

/** + -------------- STREAM LIFECYCLE ---------------- */

export type AgentStreamLifecycleStartedEvent = AgentStreamEvent & {
    channel: 'lifecycle';
    type: 'started';
    data: {
        graph_name: string;
    };
};

export type AgentStreamLifecycleCompletedEvent = AgentStreamEvent & {
    channel: 'lifecycle';
    type: 'completed';
    data: {
        graph_name: string;
    };
};

export type AgentStreamLifecycleFailedEvent = AgentStreamEvent & {
    channel: 'lifecycle';
    type: 'failed';
    data: {
        graph_name: string;
    };
};

/** + -------------- STREAM MESSAGE ---------------- */

export type AgentStreamMessageStartEvent = AgentStreamEvent & {
    channel: 'messages';
    type: 'message-start';
    data: {
        id: string;
        run_id : string;
    }
};

export type AgentStreamMessageFinishEvent = AgentStreamEvent & {
    channel: 'messages';
    type: 'message-finish';
    data: {
        id: string;
        run_id : string;
        reason : string;
        usage: {
            input_tokens: number;
            output_tokens: number;
            total_tokens: number;
            input_token_details? : Record<string, unknown>;
            output_token_details? : Record<string, unknown>;
        };
    }
};

/**
 * This is for event that trigger how many usage token used in the message input and output 
 * and total tokens for that streamed messages..
 */
export type AgentStreamMessageUsageEvent = AgentStreamEvent & {
    channel: 'messages';
    type: 'usage';
    data: {
        usage: {
            input_tokens: number;
            output_tokens: number;
            total_tokens: number;
            input_token_details? : Record<string, unknown>;
            output_token_details? : Record<string, unknown>;
        };
        run_id : string;
    }
};

export type AgentStreamMessageContentBlockEvent = AgentStreamEvent & {
    channel: 'messages';
    // content block delta are type of message that streamed in multiple part, content block start and end are used to indicate the start and end of a content block, 
    // so client can decide to render the content block in streaming way or wait until the complete content block is received.
    type: 'content-block-delta' | 'content-block-start' | 'content-block-finish';
    data: {
        delta: {
            type : 'text' | 'text-delta';
            text? : string;
        };
        run_id : string;
    }
};


/** ESA */