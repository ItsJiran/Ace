

/**
 * Session Interaction Loop — Flow Overview
 *
 * Summary:
 * - `executeSessionInteractionLoop(session, prompt)`
 *   -> validate and set session state to `STREAMING`
 *   -> create a new turn and start background processing via `sendPromptToGateway(...)`
 *   -> main loop waits for `AISessionBus` events (response 'stop') to end
 *
 * Background handler (`sendPromptToGateway`):
 * - posts request to gateway and streams response
 * - reads chunks, appends to `tmp_chunk_buffer` and uses `streamParseBuffer()`
 * - updates session state in `KernelEngine` memory as:
 *     - append `AIEntry` to current `turn.entries`
 *     - update `currentEntry.response` & `assistant_renderers`
 *     - append parsed blocks to `currentEntry.blocks`
 * - for each parsed block:
 *     - find parser handler via `RegistryEngine.getParserBlock(...)`
 *     - execute handler (may dispatch events back to `AISessionBus`)
 * - on stream completion: mark `currentEntry.status = 'completed'` and dispatch 'stop'
 *
 * ASCII Diagram:
 *
 *   User
 *    |
 *    v
 * executeSessionInteractionLoop()
 *    |
 *    v
 * updateMemory(state -> STREAMING)   <---- kernel memory (frequent reads/writes)
 *    |
 *    v
 * sendPromptToGateway() (background)
 *    |
 *    v
 * Gateway --> streaming chunks --> streamParseBuffer()
 *    |                                   |
 *    v                                   v
 * updateMemory (entries, renderers)   extracted blocks -> RegistryEngine -> handlers
 *    |                                   |
 *    v                                   v
 * AISessionBus events <----------------- handler responses
 *    |
 *    v
 * on 'stop' -> updateMemory(state -> IDLE)
 *
 * Notes:
 * - The implementation performs frequent read/update cycles on `KernelEngine` memory
 *   to keep a canonical, synchronized session state across components (UI, registry, etc).
 */

// NOTE: The current implementation intentionally calls `KernelEngine.readMemory` and
// `KernelEngine.updateMemory` repeatedly for every streaming chunk. This simplifies
// synchronization across processes and components, but it can increase memory usage
// and I/O when many AI sessions are active. Consider batching updates, using an
// in-memory session object with periodic persistence, or sending diffs instead of
// full session snapshots to reduce overhead.

import { AISessionStatus, type AIEntry, type AIRenderer, type AISession, type AITurn } from '#/schemas/ai';
import type { AIGatewayConfig } from '#/schemas/ai_gateway';

import { HealthProbe } from './healthProbe';
import { AIGatewayEngine } from '../aiGatewayEngine';
import { KernelEngine } from '../kernelEngine';
import * as TurnRenderer from './turnManager';
import { RegistryEngine } from '../registryEngine';
import { buildPrompt } from './promptBuilder';

// + ============== Session Management API ============== +
// Note: This is a simplified process management approach for AI sessions. 
// Each session spawns a main process that owns the session state memory and 
// handles the interaction loop. Subprocesses can be spawned for individual 
// turns or tool interactions, but they are not strictly required to be children of the 
// main session process in the kernel hierarchy.

export interface SessionInteractionLoopInput {
    session: AISession;
    prompt: string;
}

interface ExtractedSpecialBlock {
    block_name: string;
    raw: string;
    content: string;
}

interface SpecialBlockBufferState {
    next_buffer: string;
    stripped_prefix: string;
    extracted_blocks: ExtractedSpecialBlock[];
    has_block_or_fragment: boolean;
    fragment_block_name?: string;
}

/**
 * Parse streaming buffer for special blocks (detailed)
 *
 * Purpose:
 * - Split incoming streaming text into:
 *    - `stripped_prefix`: plain response text (not part of any block)
 *    - `extracted_blocks`: fully-formed special blocks like <tool>..</tool>
 *    - `next_buffer`: tail of the buffer that couldn't be processed yet
 *    - `has_block_or_fragment`: boolean hint whether there is a block fragment or blocks in progress
 *    - `fragment_block_name`: name of the partial tag if present (e.g. 'tool')
 *
 * High-level flow (ASCII):
 *
 *   tmp_chunk_buffer
 *      |
 *      v
 *   find first '<'
 *    /   \
 *   no    yes
 *   |      |
 * return   stripped_prefix = before '<'
 * (no     workingBuffer = from '<' onward
 * blocks)     |
 *            v
 *   try to extract full blocks at start of workingBuffer:
 *     while workingBuffer matches /^<tag>[\s\S]*?<\/tag>/:
 *       - push full block into extracted_blocks
 *       - workingBuffer = workingBuffer.slice(raw.length)
 *   if extracted_blocks.length > 0:
 *     return { next_buffer: workingBuffer, extracted_blocks, stripped_prefix, has_block_or_fragment: true }
 *   else:
 *     check for partial fragment (opening tag without close):
 *       - if match -> fragment_block_name = tagName, has_block_or_fragment = true
 *       - else -> has_block_or_fragment = false
 *
 * Caller usage notes (how the loop uses returned fields):
 * - `stripped_prefix` is appended into the current renderer / `currentEntry.response`.
 * - `extracted_blocks` are turned into block entries and dispatched to RegistryEngine handlers.
 * - `next_buffer` becomes the new `tmp_chunk_buffer` for the next read iteration.
 * - `has_block_or_fragment` tells the caller whether it should keep the buffer open for more chunks.
 *
 * Contoh singkat (ID):
 * - chunk1: "Hello <tool>run arg"
 * - chunk2: "1</tool> World"
 * => Setelah chunk1: stripped_prefix="Hello ", fragment_block_name='tool', next_buffer='<tool>run arg'
 * => Setelah chunk2: extracted_blocks=[{block_name:'tool', content:'run arg1'}], stripped_prefix='', next_buffer=' World'
 */

function streamParseBuffer(tmp_chunk_buffer: string): SpecialBlockBufferState {

    // The implementation of this function will depend on the specific 
    // format of the special blocks sent by the gateway.
    if (!tmp_chunk_buffer) {
        return {
            next_buffer: '',
            extracted_blocks: [],
            stripped_prefix: '',
            has_block_or_fragment: false,
        };
    }

    // Example implementation for blocks wrapped in <block_name>...</block_name> tags. This is a very basic parser and 
    // can be enhanced to handle nested blocks, attributes, etc. as needed.
    const firstTagIndex = tmp_chunk_buffer.indexOf('<');
    if (firstTagIndex === -1) {
        return {
            next_buffer: tmp_chunk_buffer,
            extracted_blocks: [],
            stripped_prefix: '',
            has_block_or_fragment: false,
        };
    }

    // We found a potential block start. Now we will try to extract full blocks from the buffer. If we find any incomplete 
    // block (e.g. missing closing tag), we will keep it in the buffer for future processing.

    const stripped_prefix = tmp_chunk_buffer.slice(0, firstTagIndex);
    let workingBuffer = tmp_chunk_buffer.slice(firstTagIndex);
    const extracted_blocks: ExtractedSpecialBlock[] = [];

    while (true) {
        const fullBlockMatch = workingBuffer.match(/^<([A-Za-z][\w:-]*)>([\s\S]*?)<\/\1>/);
        if (!fullBlockMatch) break;

        const [raw, block_name, content] = fullBlockMatch;
        extracted_blocks.push({
            block_name,
            raw,
            content,
        });

        workingBuffer = workingBuffer.slice(raw.length);
    }

    // If we extracted any full blocks, we can return them along with the remaining buffer. If we didn't extract any full 
    // blocks but found a potential block start, we will keep the buffer for future processing and indicate that we 
    // have a block or fragment in progress.

    if (extracted_blocks.length > 0) {
        return {
            next_buffer: workingBuffer,
            extracted_blocks,
            stripped_prefix,
            has_block_or_fragment: true,
        };
    }

    // Check if the remaining buffer contains a block fragment (e.g. starts with an opening tag 
    // but doesn't have a closing tag yet)

    const fragmentMatch = workingBuffer.match(/^<\/?([A-Za-z][\w:-]*)?$/)
        ?? workingBuffer.match(/^<([A-Za-z][\w:-]*)>?/);

    return {
        next_buffer: workingBuffer,
        extracted_blocks: [],
        stripped_prefix,
        has_block_or_fragment: true,
        fragment_block_name: fragmentMatch?.[1],
    };
}

// Note : Future improvement since we already passing the session object, we can just directly update the session memory in the interaction loop without 
// needing to read it again at the beginning of each loop. We just need to make sure to keep the session object updated with the latest state from memory 
// at the end of each loop iteration. This way we can avoid redundant memory reads and have a more efficient loop.

// Instead of window, use a specific target to avoid polluting the global scope
export const AISessionBus = new EventTarget();

export async function executeSessionInteractionLoop(input: SessionInteractionLoopInput): Promise<void> {

    console.log(`[AIGatewayEngine] Starting interaction loop for session ${input.session.session_uid} with prompt: ${input.prompt}`);

    const { session, prompt } = input;

    // -- Check if session status is currently running. If not, we should not proceed with processing the prompt.
    // unless we already implement drifting sessions where a new prompt can be sent to an existing session even after completion, 
    // we should not allow sending prompts to non-running sessions.
    if(KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status == AISessionStatus.STREAMING) {
        console.warn(`
            Session ${session.session_uid} is already in 'streaming' status. 
            Current status: ${KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status}`
        );
        return; 
    }

    // -- Create the default new turn for User and for Assistant (streaming)
    KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
        status : AISessionStatus.STREAMING,
        turns: [...session.turns, TurnRenderer.initTurn(prompt)],
        turn_index: session.turns.length, // Point to the newl y added turn
    } as AISession);
    
    // -- Run the interaction loop for the session, which will handle the entire lifecycle of the prompt 
    // processing, including streaming updates, tool interactions, and feedback loops.

    try {
    
        while(KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status === AISessionStatus.STREAMING) {

            // 1. Prepare the listener promise FIRST
            const loopPromise = new Promise((resolve) => {
                AISessionBus.addEventListener(`system:ai_session:${session.session_uid}:response`, 
                    (e: any) => resolve(e.detail), 
                    { once: true }
                );
            });

            // -- For each turn, we will update the active_entry_index and entries array in 
            // memory as we receive updates from the model.
            KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
                active_interaction_loop_attempt: (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.active_interaction_loop_attempt ?? 0) + 1,
            });

            // -- Send prompt 
            // For the sake of this example, let's assume we have a function processPrompt 
            // that handles the entire processing of the prompt and returns when the response is complete.
            await sendPromptToGateway(
                prompt, 
                session.session_uid, 
                session.sdk, 
                session.model, 
            );

            // -- Since we fire and forget the processing in the background, we can just wait till all the parse
            // works are done and the response is finalized. In a real implementation, we would likely have more complex 
            // logic here to handle streaming updates, tool interactions, and feedback loops in real-time.
            console.log(`[AIGatewayEngine] Waiting for interaction loop to complete for session ${session.session_uid}...`);
            const loopResponse = await loopPromise;

            // -- Once the processing is complete, we can update the session state 
            // to reflect the final response and mark it as idle.
            if (loopResponse == 'stop') {
                KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
                    status : AISessionStatus.IDLE,
                } as AISession);
                console.log(`[AIGatewayEngine] Interaction loop for session ${session.session_uid} completed and marked as IDLE.`);
                return; // Exit the loop and end the function since the session is now idle.
            } else {
                console.warn(`[AIGatewayEngine] Interaction loop for session ${session.session_uid} received unexpected event data: ${loopResponse}`);
            }
        }

    } catch (error) {
        console.error(`Error in interaction loop for session ${session.session_uid}:`, error);

        KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
            status: AISessionStatus.ERROR,
            error_payload: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } ,
        } as Partial<AISession>);
    }
}

/**
 * Send a prompt to a targeted gateway URL and store the async response buffer
 * into a dedicated `memory_uid`. This function returns immediately with the
 * `memory_uid` that will eventually contain the response object.
 *
 * Params:
 * - `base_url`: full URL of the gateway endpoint (e.g. http://127.0.0.1:8888/v1/generate)
 * - `prompt`, `sdk`, `model`: request metadata
 * - `opts.replyToRamKey` optional memory UID to write into; if omitted a new one is created
 * - `opts.process_uid` optional owner process UID
 *
 * The inner request/response handling is left as pseudocode below so you can
 * implement provider-specific streaming / buffer parsing logic.
 */
export async function sendPromptToGateway(
    prompt: string,
    session_uid : string,
    sdk?: string,
    model?: string,
): Promise<void> {

    console.log(`[AIGatewayEngine] Sending prompt to gateway for session ${session_uid}. Prompt: ${prompt}, SDK: ${sdk}, Model: ${model}`);

    const activeGatewayUrl = await HealthProbe.getBaseUrl();

    if (!activeGatewayUrl) {
        AISessionBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error('No healthy gateway instance available');
    }

    if (!sdk || !model) {
        AISessionBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error('SDK and model must be specified to send prompt to gateway');
    }
            

    const AIGatewayConfig : AIGatewayConfig = AIGatewayEngine.getConfig();
    // @ts-expect-error 
    const sdkConfig = AIGatewayConfig.sdks[sdk];

    // -- If the SDK is not configured properly, we should not proceed with sending the request to the gateway.
    if (!sdkConfig?.api_key) {
        AISessionBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error(`${sdk} API key not configured in gateway config`);
    }

    // -- At this point, we have all the necessary information to send the request to the gateway. 
    // We will fire and forget this request since the response will be handled asynchronously 
    // through the pre-allocated memory and event listeners.

    (async () => {
        try {

            // -- Pre-allocate the Turn Memory tied securely to the Session Process
            const abortController = new AbortController();
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                active_abort_controller: abortController,
            } as Partial<AISession>);

            // -- Send the prompt to the gateway endpoint. The gateway is responsible for handling the request,
            // communicating with the model provider, and writing the response to the specified `replyToRamKey` in memory.

            let response = await fetch(`${activeGatewayUrl}/chat/${sdk}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sdkConfig.api_key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ model: model, prompt }),
                signal: abortController.signal,
            });

            // -- Processing buffer
            if (!response.ok || !response.body) {
                throw new Error(`Response failed: ${response.statusText}`);
            }

            // -- Here we would have the logic to read from the response stream, parse the incoming data, and update the session state in memory accordingly.
            // For example, we might read chunks from the response body, parse them as they come in, and update the current turn's response 
            // in memory to reflect the streaming response from the model.
            let reader = response.body.getReader();
            let decoder = new TextDecoder();

            // -- Init AIEntry in session state for this turn with empty response and streaming status, so that the frontend 
            // can start rendering the turn immediately as it receives updates in memory.

            let newAIEntry = TurnRenderer.buildTurnEntry({
                response : '',
                
                // We can use the buildPrompt function to construct the final prompt that will be sent to the model, 
                // which can include additional context or formatting as needed.
                prompt : prompt,
                composed_prompt : buildPrompt(prompt, session_uid), 

                blocks: [],
                status: 'streaming',
            })

            // -- We can update the session state with the new AIEntry for the current turn. The active_entry_index points to the 
            // current entry being processed, which is useful for the frontend to know which entry to render and update as new data 
            // comes in. As we receive streaming updates from the gateway, we can update this AIEntry in memory with the latest response text, 
            // any parsed blocks, and the current status of the response (e.g. streaming, completed, error).
            let currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
            let currentTurn = currentSessionState.turns[currentSessionState.turn_index];

            currentTurn.entries.push(newAIEntry);
            currentTurn.active_entry_index = (currentTurn.active_entry_index ?? -1) + 1; // Point to the new entry

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                turns: [
                    ...currentSessionState.turns.slice(0, currentSessionState.turn_index),                
                    { ...currentTurn },
                ],
            });

            // -- We can use a loop to read from the stream until it's done, and 
            // update the memory with the latest response text as we go.

            // And also handle parser updates and tool interactions if the gateway is 
            // sending those as part of the stream. if let say the gateway sends specials markers
            
            // like tools parser which has handler where we should delegate the interactionLoop stop
            // in the parser handler result, we can listen for those markers in the stream and dispatch 
            // events to control the interaction loop flow accordingly.

            // This is a simplified example of how we might handle the streaming response. The actual 
            // implementation would depend on the format of the data sent by the gateway and how we 
            // want to update the session state in memory.

            let tmp_chunk_buffer = '';
            let tmp_paragraph_renderer_index = -1;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Decode the Uint8Array chunk to a string
                const chunk = decoder.decode(value, { stream: true });
                tmp_chunk_buffer += chunk;

                let blockState = streamParseBuffer(tmp_chunk_buffer);
                tmp_chunk_buffer = blockState.next_buffer;

                // At this point, we have the stripped prefix which is the new response text that is not part of any special block, 
                // and we have any extracted blocks that we can process separately. We also know if there is a block or fragment 
                // in progress which will help us handle future chunks correctly.
                let currentSessionState : AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
                let currentTurn : AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
                let currentEntry : AIEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

                // -- Update the current AIEntry's response with the new text from the stripped prefix. 
                // For Debugging: To record the raw response from the gateway, we can append the new chunk to a `raw_response` field in the AIEntry. 
                // This way we have a complete record of what was received from the gateway, which can be useful for debugging and analysis.

                if(currentEntry.response == undefined) currentEntry.response = '';
                currentEntry.response += chunk;

                KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                    ...currentSessionState,
                    turns: [
                        ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                        { ...currentTurn, entries: [
                            ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                            { ...currentEntry },
                        ] },
                    ],
                });

                // -- If there's stripped buffer then it means we have some new response text that is not part of any special block, 
                // so we can update the current AIEntry's response with this new text.

                if (blockState.stripped_prefix != '') {

                    if(tmp_paragraph_renderer_index == -1) {

                        let currentSessionState : AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
                        let currentTurn : AITurn = currentSessionState.turns?.[currentSessionState.turn_index];

                        tmp_paragraph_renderer_index = currentTurn.assistant_renderers.length;
                        currentTurn.assistant_renderers.push(
                            TurnRenderer.buildRenderer('paragraph_renderer', 'system', { text: blockState.stripped_prefix })
                        );
                        
                        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                            ...currentSessionState,
                            turns: [
                                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                                { ...currentTurn },
                            ],
                        });

                    } else {

                        let currentSessionState : AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
                        let currentTurn : AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
                        let currentRenderer : AIRenderer = currentTurn.assistant_renderers[tmp_paragraph_renderer_index];

                        if(currentRenderer.payload == undefined) {
                            currentRenderer.payload = { text: blockState.stripped_prefix };
                        } else {
                            // @ts-expect-error
                            if(currentRenderer.payload.text == undefined) {
                                // @ts-expect-error
                                currentRenderer.payload.text = blockState.stripped_prefix;
                            } else {
                                // @ts-expect-error
                                currentRenderer.payload.text += blockState.stripped_prefix;
                            }
                        }

                        currentTurn.assistant_renderers[tmp_paragraph_renderer_index] = currentRenderer;
                        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                            ...currentSessionState,
                            turns: [
                                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                                { ...currentTurn },
                            ],
                        });

                        // reset the tmp_paragraph_renderer_index if we have a block or fragment in progress, 
                        // since the new text after the block might need to be in a new renderer.
                        tmp_paragraph_renderer_index = -1;
                    }
                }

                // -- If we extracted any full blocks, we can process them here. The processing logic 
                // will depend on the type of blocks and how we want to update the session state based on them.                
                
                if (blockState.extracted_blocks.length > 0) {
                    console.log(`Extracted blocks from buffer:`, blockState.extracted_blocks);

                    for (const block of blockState.extracted_blocks) {
                        
                        // Create promises handler for block handler response so that the block handler can control the flow of the parser loop
                        // loop based on its result. For example, if the block is a tool call and the handler indicates that we should pause the stream and wait for user input, we can dispatch an event to stop the loop and update the session state accordingly. On the other hand, 
                        // if the handler indicates that we should continue with the stream, we can just continue with the next iteration of the loop to keep processing the stream.
                        const parserHandlerPromise = new Promise((resolve) => {
                            AISessionBus.addEventListener(`system:ai_session:${currentSessionState.session_uid}:block_parsing_response`, 
                                (e: any) => resolve(e.detail), 
                                { once: true }
                            );
                        });

                        const parserHandlerDispatch = (detail: any) => {
                            AISessionBus.dispatchEvent(new CustomEvent(`system:ai_session:${currentSessionState.session_uid}:block_parsing_response`, { detail }));
                        }

                        // get the block handler from the registry based on the block_name, and then execute the handler with the block content. 
                        // The handler can then update the session state in memory as needed, for example to add tool calls, update parsers, etc.
                        // Append to the kernel memory block entry for the current for debugging for what block we received and what content, 
                        // we can keep an array of received blocks in the session state memory and append to it whenever we receive a new block from the stream.
                        const blockHandler = RegistryEngine.getParserBlock(block.block_name)?.handler;

                        let currentSessionState : AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
                        let currentTurn : AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
                        let currentEntry : AIEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;
                        let currentBlock = TurnRenderer.buildBlockEntry({
                            session_uid,
                            process_uid: currentSessionState.process_uid,
                            turn_index: currentSessionState.turn_index,
                            entry_index: currentTurn.active_entry_index as number,
                            block_index: (currentEntry.blocks ? currentEntry.blocks.length : 0),
                            block_slug: block.block_name,
                            payload: { content: block.content },
                        });

                        currentEntry.blocks = [
                            ...(currentEntry.blocks ? currentEntry.blocks : []),
                            currentBlock,
                        ];

                        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                            ...currentSessionState,
                            turns: [
                                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                                { ...currentTurn, entries: [
                                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                                    { ...currentEntry },
                                ] },
                            ],
                        });

                        if (blockHandler) {
                            console.log(`Found handler for block ${block.block_name}, executing handler...`);
                            await blockHandler({
                                block: currentBlock,
                                dispatchParserResponse: parserHandlerDispatch,
                                abortCurrentResponseBuffer : abortController.signal, 
                            });
                        } else {
                            console.warn(`No handler found for block ${block.block_name}`);
                        }

                        // Based on the response from the block handler, we can decide whether to stop the interaction loop or not. 
                        // For example, if the block is a tool call and the handler indicates that we should pause the stream and wait for 
                        // user input, we can dispatch an event to stop the loop and update the session state accordingly.
                        
                        const promiseResponse = await parserHandlerPromise;
                        console.log(`Received response from block handler for block ${block.block_name}:`, promiseResponse);
                        
                        // @ts-expect-error
                        if(promiseResponse?.action === 'stop') {
                            console.log(`Block handler for block ${block.block_name} requested to stop the interaction loop.`);
                            AISessionBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
                            break; 
                        }

                        // @ts-expect-error
                        if(promiseResponse?.action === 'continue') {
                            console.log(`Block handler for block ${block.block_name} requested to continue the interaction loop.`);
                            // We can just continue with the next iteration of the loop to keep processing the stream.
                        }

                        // @ts-expect-error
                        if(promiseResponse?.action === 'stop_entry_parser_but_continue_loop') {
                            // future improvement: we can have more granular control over the interaction loop flow based on the 
                            // block handler response. For example, in this case, we might want to stop the current entry's parser 
                            // but continue with the rest of the interaction loop. We can achieve this by updating the session 
                            // state to mark the current entry's parser as stopped, and then continue with the next 
                            // iteration of the loop to keep processing the stream for any new entries or turns.
                        }

                    }
                }

                // -- Handled next buffer with potential block fragments. If we have a block fragment, we will keep it in the buffer 
                // and wait for future chunks to complete it.

                if (!blockState.has_block_or_fragment && tmp_chunk_buffer != '') {
                    if(tmp_paragraph_renderer_index == -1) {

                        let currentSessionState : AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
                        let currentTurn : AITurn = currentSessionState.turns?.[currentSessionState.turn_index];

                        tmp_paragraph_renderer_index = currentTurn.assistant_renderers.length;
                        currentTurn.assistant_renderers.push(
                            TurnRenderer.buildRenderer('paragraph_renderer', 'system', { text: tmp_chunk_buffer })
                        );
                        
                        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                            ...currentSessionState,
                            turns: [
                                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                                { ...currentTurn },
                            ],
                        });

                    } else {

                        let currentSessionState : AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
                        let currentTurn : AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
                        let currentRenderer = currentTurn.assistant_renderers[tmp_paragraph_renderer_index];

                        currentRenderer.payload = { text : tmp_chunk_buffer };
                        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                            ...currentSessionState,
                            turns: [
                                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                                { ...currentTurn, assistant_renderers: [
                                    ...currentTurn.assistant_renderers.slice(0, tmp_paragraph_renderer_index),
                                    currentRenderer,
                                ] },
                            ],
                        });

                    }
                }
            }

            // Update the AIEntry status to completed once the stream is done
            currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
            currentTurn = currentSessionState.turns?.[currentSessionState.turn_index];

            let currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;
            currentEntry.status = 'completed';

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                ...currentSessionState,
                turns: [
                    ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                    { ...currentTurn, entries: [
                        ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                        { ...currentEntry },
                    ] },
                ],
            });

            // Since the parsing is finish we can stop the main loop
            AISessionBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));

        } catch (error) {
            // Dispatch event to the main loop to tell to stop the whole interaction loop 
            AISessionBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));

            // Update the current AIEntry's status to error if we encounter any error during the processing, 
            // so that the frontend can render it accordingly.
            let currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
            let currentTurn = currentSessionState.turns?.[currentSessionState.turn_index];
            
            let currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;
            currentEntry.status = 'error';

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                ...currentSessionState,
                turns: [
                    ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                    { ...currentTurn, entries: [
                        ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                        { ...currentEntry },
                    ] },
                ],
            });

            // Update session state with error information
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                status: AISessionStatus.ERROR,
                error_payload: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } ,
            } as Partial<AISession>);
        }
    })();
}