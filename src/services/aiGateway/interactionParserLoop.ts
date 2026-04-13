

/**
 * Session Interaction Parser Loop — Runtime Overview
 *
 * This file owns the block-by-block parsing stage for an already-running AI session stream.
 * Its job is not to decide the whole session lifecycle, but to control how streamed text is split
 * into plain assistant text versus parser blocks, and how each parsed block gates the next block.
 *
 * Runtime flow in this file is organized as staged parser work:
 * 1. `sendPromptToGateway(...)` starts the background parser request.
 * 2. `runGatewayStreamRequest(...)` initializes the entry, validates the gateway target,
 *    opens the stream, and hands the reader to the chunk loop.
 * 3. `processGatewayStream(...)` reads one chunk at a time.
 * 4. `processGatewayChunk(...)` splits the incoming buffer into plain text and extracted blocks.
 * 5. Plain text is appended to the current entry and mirrored into paragraph renderers.
 * 6. Each extracted block is parsed one-by-one through `processSingleExtractedBlock(...)`.
 * 7. The block handler emits an `AIParserProtocolState` through `AISessionBlockBus`.
 * 8. That protocol state decides whether parsing continues, pauses for feedback, or stops.
 * 9. When the stream ends, the current entry is finalized or marked as error.
 *
 * Runtime invariant:
 * - only one parsed block is allowed to decide the next parser step at a time.
 * - this means one block handler can halt the next block parsing until feedback is available.
 * - plain streamed text may continue to accumulate before and after blocks, but parser control
 *   always remains block-scoped and sequential.
 *
 * ASCII diagram:
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

import { AIParserProtocolState, AISessionStatus, type AIEntry, type AIRenderer, type AISession, type AITurn } from '#/schemas/ai';
import type { AIGatewayConfig, AIGatewaySDKTarget } from '#/schemas/ai_gateway';

import { HealthProbe } from './healthProbe';
import { AIGatewayEngine } from '../aiGatewayEngine';
import { KernelEngine } from '../kernelEngine';
import * as TurnRenderer from './turnManager';
import { RegistryEngine } from '../registryEngine';
import { buildPrompt } from './promptBuilder';

export const AISessionBlockBus = new EventTarget();

// + ============== Runtime Stage 0: Contracts and Shared State ============== +
// These are local types and runtime buffers used by the parser loop while a single
// streamed entry is active.

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

interface GatewayTargetConfig {
    activeGatewayUrl: string;
    sdkConfig: AIGatewaySDKTarget;
}

interface StreamRuntimeState {
    tmp_chunk_buffer: string;
    tmp_paragraph_renderer_index: number;
}

// + ============== Runtime Stage 1: Entry Point ============== +
// Callers start here. This function spins up the background parser workflow for one session prompt.

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
    session_uid: string,
    sdk?: string,
    model?: string,
): Promise<void> {

    console.log(`[AIGatewayEngine] Sending prompt to gateway for session ${session_uid}. Prompt: ${prompt}, SDK: ${sdk}, Model: ${model}`);

    (async () => {
        try {
            await runGatewayStreamRequest(prompt, session_uid, sdk, model);
        } catch (error) {
            failStreamingEntry(session_uid, error);
        }
    })();
}

// + ============== Runtime Stage 2: Orchestrate One Parser Request ============== +
// This is the top-down runtime path used by the entry point: initialize the active entry,
// prepare the gateway request, run the stream loop, then finalize the entry.

async function runGatewayStreamRequest(
    prompt: string,
    session_uid: string,
    sdk?: string,
    model?: string,
): Promise<void> {
    initializeStreamingEntry(session_uid, prompt);

    const { activeGatewayUrl, sdkConfig } = await validateGatewayTarget(session_uid, sdk, model);
    const abortController = attachAbortControllerToSession(session_uid);
    const response = await openGatewayResponseStream(
        activeGatewayUrl,
        session_uid,
        sdkConfig,
        prompt,
        sdk,
        model,
        abortController,
    );

    await processGatewayStream(session_uid, response.body!.getReader(), abortController);
    finalizeStreamingEntry(session_uid);
}

// + ============== Runtime Stage 3: Prepare Gateway Request ============== +
// Before any chunk can be processed, the parser runtime validates the active provider target,
// binds an abort controller to the session, and opens the streaming HTTP response.

async function validateGatewayTarget(
    session_uid: string,
    sdk?: string,
    model?: string,
): Promise<GatewayTargetConfig> {

    const activeGatewayUrl = await HealthProbe.getBaseUrl();

    if (!activeGatewayUrl) {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error('No healthy gateway instance available');
    }

    if (!sdk || !model) {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error('SDK and model must be specified to send prompt to gateway');
    }

    const AIGatewayConfig: AIGatewayConfig = AIGatewayEngine.getConfig();
    // @ts-expect-error
    const sdkConfig = AIGatewayConfig.sdks[sdk];

    if (!sdkConfig?.api_key) {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error(`${sdk} API key not configured in gateway config`);
    }

    return {
        activeGatewayUrl,
        sdkConfig,
    };
}

function attachAbortControllerToSession(session_uid: string): AbortController {
    const abortController = new AbortController();

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        active_abort_controller: abortController,
    } as Partial<AISession>);

    return abortController;
}

// Opens the provider stream after validation has already succeeded.
async function openGatewayResponseStream(
    activeGatewayUrl: string,
    session_uid: string,
    sdkConfig: AIGatewaySDKTarget,
    prompt: string,
    sdk?: string,
    model?: string,
    abortController?: AbortController,
): Promise<Response> {
    const response = await fetch(`${activeGatewayUrl}/chat/${sdk}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sdkConfig.api_key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: model, prompt }),
        signal: abortController?.signal,
    });

    if (!response.ok || !response.body) {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error(`Response failed: ${response.statusText}`);
    }

    return response;
}

// + ============== Runtime Stage 4: Initialize Active Entry ============== +
// The parser always writes into one active entry. That entry must exist in session memory
// before plain text or parsed blocks can be appended.

function initializeStreamingEntry(session_uid: string, prompt: string): void {
    const newAIEntry = TurnRenderer.buildTurnEntry({
        response: '',
        prompt: prompt,
        composed_prompt: buildPrompt(prompt, session_uid),
        blocks: [],
        status: 'streaming',
    });

    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns[currentSessionState.turn_index];

    currentTurn.entries.push(newAIEntry);
    currentTurn.active_entry_index = (currentTurn.active_entry_index ?? -1) + 1;

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            { ...currentTurn },
        ],
    });
}


// + ============== Runtime Stage 5: Run Chunk Loop ============== +
// This is the live read loop. It decodes one chunk at a time and hands each chunk to the
// lower-level parser step that updates memory, text renderers, and parsed blocks.

async function processGatewayStream(
    session_uid: string,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    abortController: AbortController,
): Promise<void> {
    const decoder = new TextDecoder();
    const runtimeState: StreamRuntimeState = {
        tmp_chunk_buffer: '',
        tmp_paragraph_renderer_index: -1,
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const shouldStop = await processGatewayChunk(session_uid, chunk, runtimeState, abortController);

        if (shouldStop) {
            break;
        }
    }
}

// + ============== Runtime Stage 6: Process One Chunk ============== +
// For each decoded chunk, the runtime parses the mixed buffer, appends plain text, runs block
// handlers sequentially, and flushes any safe trailing plain text into renderers.

async function processGatewayChunk(
    session_uid: string,
    chunk: string,
    runtimeState: StreamRuntimeState,
    abortController: AbortController,
): Promise<boolean> {
    runtimeState.tmp_chunk_buffer += chunk;

    const blockState = streamParseBuffer(runtimeState.tmp_chunk_buffer);
    runtimeState.tmp_chunk_buffer = blockState.next_buffer;

    appendChunkToCurrentEntry(session_uid, chunk);
    renderStrippedPrefix(session_uid, blockState.stripped_prefix, runtimeState);

    const shouldStop = await processExtractedBlocks(session_uid, blockState.extracted_blocks, abortController);
    if (shouldStop) {
        return true;
    }

    if (!blockState.has_block_or_fragment && runtimeState.tmp_chunk_buffer != '') {
        flushPlainTextBufferToRenderer(session_uid, runtimeState);
    }

    return false;
}

// + ============== Runtime Stage 7: Apply Plain Text Output ============== +
// Any streamed text outside parser blocks is appended to the raw entry response and also
// mirrored into paragraph renderers so the UI reflects incremental output immediately.
function appendChunkToCurrentEntry(session_uid: string, chunk: string): void {
    const currentSessionState: AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn: AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentEntry: AIEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    if (currentEntry.response == undefined) currentEntry.response = '';
    currentEntry.response += chunk;

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ]
            },
        ],
    });
}

function renderStrippedPrefix(
    session_uid: string,
    stripped_prefix: string,
    runtimeState: StreamRuntimeState,
): void {
    if (stripped_prefix == '') {
        return;
    }

    if (runtimeState.tmp_paragraph_renderer_index == -1) {
        const currentSessionState: AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        const currentTurn: AITurn = currentSessionState.turns?.[currentSessionState.turn_index];

        runtimeState.tmp_paragraph_renderer_index = currentTurn.assistant_renderers.length;
        currentTurn.assistant_renderers.push(
            TurnRenderer.buildRenderer('paragraph_renderer', 'system', { text: stripped_prefix })
        );

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            ...currentSessionState,
            turns: [
                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                { ...currentTurn },
            ],
        });

        return;
    }

    const currentSessionState: AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn: AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentRenderer: AIRenderer = currentTurn.assistant_renderers[runtimeState.tmp_paragraph_renderer_index];

    if (currentRenderer.payload == undefined) {
        currentRenderer.payload = { text: stripped_prefix };
    } else {
        // @ts-expect-error
        if (currentRenderer.payload.text == undefined) {
            // @ts-expect-error
            currentRenderer.payload.text = stripped_prefix;
        } else {
            // @ts-expect-error
            currentRenderer.payload.text += stripped_prefix;
        }
    }

    currentTurn.assistant_renderers[runtimeState.tmp_paragraph_renderer_index] = currentRenderer;
    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            { ...currentTurn },
        ],
    });

    runtimeState.tmp_paragraph_renderer_index = -1;
}

// + ============== Runtime Stage 8: Parse Blocks Sequentially ============== +
// Complete blocks are processed one-by-one. After each block, the block handler emits an
// `AIParserProtocolState` that decides whether the parser may continue or must halt.

async function processExtractedBlocks(
    session_uid: string,
    extracted_blocks: ExtractedSpecialBlock[],
    abortController: AbortController,
): Promise<boolean> {
    if (extracted_blocks.length === 0) {
        return false;
    }

    console.log(`Extracted blocks from buffer:`, extracted_blocks);

    for (const block of extracted_blocks) {
        const shouldStop = await processSingleExtractedBlock(session_uid, block, abortController);
        if (shouldStop) {
            return true;
        }
    }

    return false;
}

async function processSingleExtractedBlock(
    session_uid: string,
    block: ExtractedSpecialBlock,
    abortController: AbortController,
): Promise<boolean> {
    const currentSessionStateForResponse = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    let hasParserResponse = false;
    let resolveParserState: ((value: AIParserProtocolState | undefined) => void) | undefined;

    console.log(`[AIGatewayEngine] Processing block ${block} for session ${session_uid}`);

    const parserHandlerPromise = new Promise<AIParserProtocolState | undefined>((resolve) => {
        resolveParserState = resolve;
        AISessionBlockBus.addEventListener(`system:ai_session:${currentSessionStateForResponse.session_uid}:block_parsing_response`,
            (e: Event) => {
                hasParserResponse = true;
                resolve((e as CustomEvent<AIParserProtocolState>).detail);
            },
            { once: true }
        );
    });

    const parserHandlerDispatch = (detail: AIParserProtocolState) => {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${currentSessionStateForResponse.session_uid}:block_parsing_response`, { detail }));
    };

    const blockHandler = RegistryEngine.getParserBlock(block.block_name)?.handler;

    const currentSessionState: AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn: AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentEntry: AIEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;
    const currentBlock = TurnRenderer.buildBlockEntry({
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
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ]
            },
        ],
    });

    if (blockHandler) {
        console.log(`Found handler for block ${block.block_name}, executing handler...`);
        await blockHandler({
            block: currentBlock,
            dispatchParserResponse: parserHandlerDispatch,
            abortCurrentResponseBuffer: abortController.signal,
        });

        if (!hasParserResponse) {
            resolveParserState?.(AIParserProtocolState.COMPLETED);
        }
    } else {
        console.warn(`No handler found for block ${block.block_name}`);
        resolveParserState?.(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    }

    const promiseResponse = await parserHandlerPromise;
    console.log(`Received response from block handler for block ${block.block_name}:`, promiseResponse);

    if (promiseResponse === AIParserProtocolState.WAITING_FOR_FEEDBACK) {
        console.log(`Block handler for block ${block.block_name} requested to stop the interaction loop.`);
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        return true;
    }

    if (
        promiseResponse === AIParserProtocolState.CONTINUE_NEXT_BLOCK
        || promiseResponse === AIParserProtocolState.COMPLETED
    ) {
        console.log(`Block handler for block ${block.block_name} requested to continue the interaction loop.`);
    }

    if (
        promiseResponse === AIParserProtocolState.INTERRUPTED
        || promiseResponse === AIParserProtocolState.ERROR
    ) {
        console.log(`Block handler for block ${block.block_name} requested to halt parser progression.`);
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        return true;
    }

    return false;
}

// + ============== Runtime Stage 9: Flush Trailing Plain Text ============== +
// If a chunk leaves trailing plain text with no active block fragment, flush that tail into
// the assistant renderer before the next read cycle so rendering stays aligned with memory.

function flushPlainTextBufferToRenderer(session_uid: string, runtimeState: StreamRuntimeState): void {
    if (runtimeState.tmp_chunk_buffer == '') {
        return;
    }

    if (runtimeState.tmp_paragraph_renderer_index == -1) {
        const currentSessionState: AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        const currentTurn: AITurn = currentSessionState.turns?.[currentSessionState.turn_index];

        runtimeState.tmp_paragraph_renderer_index = currentTurn.assistant_renderers.length;
        currentTurn.assistant_renderers.push(
            TurnRenderer.buildRenderer('paragraph_renderer', 'system', { text: runtimeState.tmp_chunk_buffer })
        );

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            ...currentSessionState,
            turns: [
                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                { ...currentTurn },
            ],
        });

        return;
    }

    const currentSessionState: AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn: AITurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentRenderer = currentTurn.assistant_renderers[runtimeState.tmp_paragraph_renderer_index];

    currentRenderer.payload = { text: runtimeState.tmp_chunk_buffer };
    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, assistant_renderers: [
                    ...currentTurn.assistant_renderers.slice(0, runtimeState.tmp_paragraph_renderer_index),
                    currentRenderer,
                ]
            },
        ],
    });
}

// + ============== Runtime Stage 10: Finalize Or Fail Entry ============== +
// When the stream is finished, or when the parser runtime fails, this stage closes the active
// entry and notifies the rest of the session runtime through the block bus.

function finalizeStreamingEntry(session_uid: string): void {
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    currentEntry.status = 'completed';

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ]
            },
        ],
    });

    AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
}

function failStreamingEntry(session_uid: string, error: unknown): void {
    AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));

    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    console.log(currentSessionState);
    currentEntry.status = 'error';

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ]
            },
        ],
    });

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        status: AISessionStatus.ERROR,
        error_payload: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
    } as Partial<AISession>);
}

// + ============== Runtime Stage 11: Parse Incoming Buffer ============== +
// This is the lowest-level parsing detail. By the time execution reaches here, the runtime is
// already inside one active chunk step and only needs to split text from complete block markup.

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
