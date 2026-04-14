

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
 * 4. `processGatewayChunk(...)` appends raw text into the current entry and advances the incremental parser state.
 * 5. Plain text outside parser tags is mirrored into paragraph renderers.
 * 6. When an opening tag is found, an `AIBlock` is created immediately with empty content.
 * 7. While the block is open, incoming text is appended into the same block and delegated through
 *    `handlerChunk(...)` so the parser can react before the block is complete.
 * 8. When the closing tag is found, the block is finalized and `handlerComplete(...)` decides whether
 *    parsing continues, pauses for feedback, or stops.
 * 9. If the stream dies while a block is still open, the same block instance is marked aborted and
 *    `handlerAbort(...)` gets a cleanup opportunity.
 * 10. When the stream ends cleanly, the current entry is finalized.
 *
 * Runtime invariant:
 * - only one parsed block is allowed to decide the next parser step at a time.
 * - this means one active block instance owns parser control until it completes or aborts.
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
 * Gateway --> streaming chunks --> processGatewayChunk()
 *    |                                   |
 *    v                                   v
 * updateMemory (raw entry text)      detect <tag>
 *                                        |
 *                                        v
 *                                   create AIBlock at start
 *                                        |
 *                           chunk text --> handlerChunk()
 *                                        |
 *                          closing tag --> handlerComplete()
 *                                        |
 *                             abort/error --> handlerAbort()
 *                                        |
 *                                        v
 * AISessionBus events <---------------- parser protocol response
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

import { AIBlockLifecycleStatus, AIParserProtocolState, AISessionStatus, type AIBlock, type AIEntry, type AIRenderer, type AISession, type AITurn } from '#/schemas/ai';
import type { AIGatewayConfig, AIGatewaySDKTarget } from '#/schemas/ai_gateway';
import type { ParserBlockLifecycle } from '#/schemas/parser';

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

interface GatewayTargetConfig {
    activeGatewayUrl: string;
    sdkConfig: AIGatewaySDKTarget;
}

interface ActiveStreamBlock {
    block_slug: string;
    block_index: number;
    closing_tag: string;
}

interface StreamRuntimeState {
    pending_buffer: string;
    tmp_paragraph_renderer_index: number;
    active_block?: ActiveStreamBlock;
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
            await failStreamingEntry(session_uid, error);
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
    const composed_prompt = buildPrompt(prompt, session_uid);
    initializeStreamingEntry(session_uid, prompt, composed_prompt);

    const { activeGatewayUrl, sdkConfig } = await validateGatewayTarget(session_uid, sdk, model);
    const abortController = attachAbortControllerToSession(session_uid);
    const response = await openGatewayResponseStream(
        activeGatewayUrl,
        session_uid,
        sdkConfig,
        composed_prompt,
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
    composed_prompt: string,
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
        body: JSON.stringify({ model: model, prompt: composed_prompt }),
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

function initializeStreamingEntry(session_uid: string, prompt: string, composed_prompt: string): void {
    const newAIEntry = TurnRenderer.buildTurnEntry({
        response: '',
        prompt: prompt,
        composed_prompt: composed_prompt,
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
        pending_buffer: '',
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

    if (runtimeState.active_block) {
        await abortActiveBlock(session_uid, runtimeState, abortController, 'Stream ended before block closing tag');
    }

    if (runtimeState.pending_buffer !== '') {
        flushPlainTextBufferToRenderer(session_uid, runtimeState);
        runtimeState.pending_buffer = '';
    }
}

// + ============== Runtime Stage 6: Process One Chunk ============== +
// For each decoded chunk, the runtime parses the mixed buffer, appends plain text, runs block
// handlers sequentially, and flushes any safe trailing plain text into renderers.
//
// Important detail:
// - a block is instantiated as soon as `<block_slug>` is seen.
// - from that point on, every following character belongs either to the active block content
//   or to the block closing tag.
// - the same AIBlock object is updated in-place through start -> chunk -> complete or abort.

async function processGatewayChunk(
    session_uid: string,
    chunk: string,
    runtimeState: StreamRuntimeState,
    abortController: AbortController,
): Promise<boolean> {
    appendChunkToCurrentEntry(session_uid, chunk);

    runtimeState.pending_buffer += chunk;

    while (runtimeState.pending_buffer !== '') {
        if (runtimeState.active_block) {
            // Once a block has started, the parser is no longer searching for new opening tags.
            // It only looks for the matching closing tag of the active block.
            const activeBlock = getActiveBlockFromRuntime(session_uid, runtimeState);
            if (!activeBlock) {
                runtimeState.active_block = undefined;
                continue;
            }

            const closingIndex = runtimeState.pending_buffer.indexOf(runtimeState.active_block.closing_tag);
            if (closingIndex === -1) {
                // No closing tag yet. Everything currently buffered belongs to the active block,
                // so we append it and delegate the delta through handlerChunk.
                const chunkText = runtimeState.pending_buffer;
                runtimeState.pending_buffer = '';

                if (chunkText !== '') {
                    appendContentToBlock(session_uid, activeBlock, chunkText);
                    const protocolState = await invokeBlockLifecycleHandler(session_uid, activeBlock, 'chunk', abortController, chunkText);
                    if (shouldStopForParserProtocol(protocolState)) {
                        await abortActiveBlock(session_uid, runtimeState, abortController, 'Parser halted during chunk lifecycle');
                        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
                        return true;
                    }
                }

                break;
            }

            const chunkText = runtimeState.pending_buffer.slice(0, closingIndex);
            runtimeState.pending_buffer = runtimeState.pending_buffer.slice(closingIndex + runtimeState.active_block.closing_tag.length);

            if (chunkText !== '') {
                // The closing tag was found in this chunk, so we first flush the remaining content
                // into the active block before finalizing it.
                appendContentToBlock(session_uid, activeBlock, chunkText);
                const chunkState = await invokeBlockLifecycleHandler(session_uid, activeBlock, 'chunk', abortController, chunkText);
                if (shouldStopForParserProtocol(chunkState)) {
                    await abortActiveBlock(session_uid, runtimeState, abortController, 'Parser halted during chunk lifecycle');
                    AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
                    return true;
                }
            }

            // At this point the active block is complete and no longer receives chunk updates.
            const completedBlock = markBlockCompleted(session_uid, activeBlock);
            const completeState = await invokeBlockLifecycleHandler(session_uid, completedBlock, 'complete', abortController);
            runtimeState.active_block = undefined;

            if (completeState === AIParserProtocolState.WAITING_FOR_FEEDBACK) {
                AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
                return true;
            }

            if (shouldStopForParserProtocol(completeState)) {
                AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
                return true;
            }

            continue;
        }

        const firstTagIndex = runtimeState.pending_buffer.indexOf('<');
        if (firstTagIndex === -1) {
            flushPlainTextBufferToRenderer(session_uid, runtimeState);
            runtimeState.pending_buffer = '';
            break;
        }

        if (firstTagIndex > 0) {
            const plainText = runtimeState.pending_buffer.slice(0, firstTagIndex);
            runtimeState.pending_buffer = runtimeState.pending_buffer.slice(firstTagIndex);
            renderStrippedPrefix(session_uid, plainText, runtimeState);
            continue;
        }

        const openingTagMatch = runtimeState.pending_buffer.match(/^<([A-Za-z][\w:-]*)>/);
        if (!openingTagMatch) {
            if (isPotentialOpeningTagFragment(runtimeState.pending_buffer)) {
                break;
            }

            renderStrippedPrefix(session_uid, runtimeState.pending_buffer.slice(0, 1), runtimeState);
            runtimeState.pending_buffer = runtimeState.pending_buffer.slice(1);
            continue;
        }

        const [openingTag, blockSlug] = openingTagMatch;
        runtimeState.pending_buffer = runtimeState.pending_buffer.slice(openingTag.length);

        // Opening tag found: create the block immediately even though its content is still empty.
        // This gives handlers a stable block reference that survives across future chunks.
        const startedBlock = createStreamingBlock(session_uid, blockSlug);
        runtimeState.active_block = {
            block_slug: blockSlug,
            block_index: startedBlock.block_index,
            closing_tag: `</${blockSlug}>`,
        };

        const startState = await invokeBlockLifecycleHandler(session_uid, startedBlock, 'start', abortController);
        if (shouldStopForParserProtocol(startState)) {
            await abortActiveBlock(session_uid, runtimeState, abortController, 'Parser halted during start lifecycle');
            AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
            return true;
        }
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

// + ============== Runtime Stage 8: Parse Blocks Incrementally ============== +
// Blocks are now created as soon as an opening tag is found, then fed chunk-by-chunk until
// a closing tag finalizes the same block instance.

function createStreamingBlock(session_uid: string, blockSlug: string): AIBlock {
    // This is the canonical runtime reference for one in-flight block instance.
    // The object starts empty, then accumulates content and runtime context until completion.
    const runtimeBlock = RegistryEngine.getParserBlock(blockSlug);
    const { currentSessionState, currentTurn, currentEntry } = getCurrentEntryRefs(session_uid);
    const now = Date.now();

    const currentBlock = TurnRenderer.buildBlockEntry({
        session_uid,
        process_uid: currentSessionState.process_uid,
        turn_index: currentSessionState.turn_index,
        entry_index: currentTurn.active_entry_index as number,
        block_index: currentEntry.blocks ? currentEntry.blocks.length : 0,
        block_slug: blockSlug,
        package_ref: runtimeBlock?.package_name,
        lifecycle_status: AIBlockLifecycleStatus.STARTED,
        opened_at: now,
        updated_at: now,
        chunk_count: 0,
        runtime_context: {},
        payload: { content: '' },
    });

    currentEntry.blocks = [
        ...(currentEntry.blocks ? currentEntry.blocks : []),
        currentBlock,
    ];

    persistCurrentEntry(session_uid, currentSessionState, currentTurn, currentEntry);
    return currentBlock;
}

function getActiveBlockFromRuntime(session_uid: string, runtimeState: StreamRuntimeState): AIBlock | null {
    if (!runtimeState.active_block) return null;

    const { currentEntry } = getCurrentEntryRefs(session_uid);
    const block = currentEntry.blocks?.[runtimeState.active_block.block_index] ?? null;
    return block ?? null;
}

function appendContentToBlock(session_uid: string, block: AIBlock, chunkText: string): AIBlock {
    // Chunk accumulation is intentionally simple: append the delta and let the parser-specific
    // handler decide whether it needs to inspect partial content or store extra runtime context.
    const now = Date.now();
    block.lifecycle_status = AIBlockLifecycleStatus.STREAMING;
    block.updated_at = now;
    block.chunk_count = (block.chunk_count ?? 0) + 1;
    block.payload.content = `${block.payload.content ?? ''}${chunkText}`;

    persistBlock(session_uid, block);
    return block;
}

function markBlockCompleted(session_uid: string, block: AIBlock): AIBlock {
    const now = Date.now();
    block.lifecycle_status = AIBlockLifecycleStatus.COMPLETED;
    block.completed_at = now;
    block.updated_at = now;

    persistBlock(session_uid, block);
    return block;
}

async function abortActiveBlock(
    session_uid: string,
    runtimeState: StreamRuntimeState,
    abortController: AbortController,
    reason: string,
): Promise<void> {
    const activeBlock = getActiveBlockFromRuntime(session_uid, runtimeState);
    if (!activeBlock) {
        runtimeState.active_block = undefined;
        return;
    }

    activeBlock.lifecycle_status = AIBlockLifecycleStatus.ABORTED;
    activeBlock.aborted_at = Date.now();
    activeBlock.updated_at = activeBlock.aborted_at;
    activeBlock.runtime_context = {
        ...(activeBlock.runtime_context ?? {}),
        abort_reason: reason,
    };

    persistBlock(session_uid, activeBlock);
    await invokeBlockLifecycleHandler(session_uid, activeBlock, 'abort', abortController);
    runtimeState.active_block = undefined;
}

async function invokeBlockLifecycleHandler(
    session_uid: string,
    block: AIBlock,
    lifecycle: ParserBlockLifecycle,
    abortController: AbortController,
    chunkText?: string,
): Promise<AIParserProtocolState> {
    // Lifecycle dispatch stays protocol-driven: handlers can still gate the outer parser flow
    // by emitting AIParserProtocolState through dispatchParserResponse.
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const runtimeBlock = RegistryEngine.getParserBlock(block.block_slug);
    const lifecycleHandler = lifecycle === 'start'
        ? runtimeBlock?.handlers.start
        : lifecycle === 'chunk'
            ? runtimeBlock?.handlers.chunk
            : lifecycle === 'complete'
                ? runtimeBlock?.handlers.complete
                : runtimeBlock?.handlers.abort;

    if (!lifecycleHandler) {
        return lifecycle === 'complete' ? AIParserProtocolState.COMPLETED : AIParserProtocolState.CONTINUE_NEXT_BLOCK;
    }

    let hasParserResponse = false;
    let resolveParserState: ((value: AIParserProtocolState | undefined) => void) | undefined;
    const parserHandlerPromise = new Promise<AIParserProtocolState | undefined>((resolve) => {
        resolveParserState = resolve;
        AISessionBlockBus.addEventListener(
            `system:ai_session:${currentSessionState.session_uid}:block_parsing_response`,
            (e: Event) => {
                hasParserResponse = true;
                resolve((e as CustomEvent<AIParserProtocolState>).detail);
            },
            { once: true }
        );
    });

    const parserHandlerDispatch = (detail: AIParserProtocolState) => {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${currentSessionState.session_uid}:block_parsing_response`, { detail }));
    };

    await lifecycleHandler({
        block,
        lifecycle,
        chunk_text: chunkText,
        dispatchParserResponse: parserHandlerDispatch,
        abortCurrentResponseBuffer: abortController.signal,
    });

    persistBlock(session_uid, block);

    if (!hasParserResponse) {
        resolveParserState?.(lifecycle === 'complete' ? AIParserProtocolState.COMPLETED : AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    }

    return (await parserHandlerPromise) ?? AIParserProtocolState.CONTINUE_NEXT_BLOCK;
}

function shouldStopForParserProtocol(protocolState: AIParserProtocolState): boolean {
    return protocolState === AIParserProtocolState.WAITING_FOR_FEEDBACK
        || protocolState === AIParserProtocolState.INTERRUPTED
        || protocolState === AIParserProtocolState.ERROR;
}

function getCurrentEntryRefs(session_uid: string): {
    currentSessionState: AISession;
    currentTurn: AITurn;
    currentEntry: AIEntry;
} {
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index] as AITurn;
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    if (!currentEntry.blocks) {
        currentEntry.blocks = [];
    }

    return { currentSessionState, currentTurn, currentEntry };
}

function persistCurrentEntry(session_uid: string, currentSessionState: AISession, currentTurn: AITurn, currentEntry: AIEntry): void {
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

function persistBlock(session_uid: string, block: AIBlock): void {
    const { currentSessionState, currentTurn, currentEntry } = getCurrentEntryRefs(session_uid);
    currentEntry.blocks = [
        ...(currentEntry.blocks ?? []).slice(0, block.block_index),
        block,
        ...(currentEntry.blocks ?? []).slice(block.block_index + 1),
    ];

    persistCurrentEntry(session_uid, currentSessionState, currentTurn, currentEntry);
}

// + ============== Runtime Stage 9: Flush Trailing Plain Text ============== +
// If a chunk leaves trailing plain text with no active block fragment, flush that tail into
// the assistant renderer before the next read cycle so rendering stays aligned with memory.

function flushPlainTextBufferToRenderer(session_uid: string, runtimeState: StreamRuntimeState): void {
    if (runtimeState.pending_buffer == '') {
        return;
    }

    if (runtimeState.tmp_paragraph_renderer_index == -1) {
        const currentSessionState: AISession = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        const currentTurn: AITurn = currentSessionState.turns?.[currentSessionState.turn_index];

        runtimeState.tmp_paragraph_renderer_index = currentTurn.assistant_renderers.length;
        currentTurn.assistant_renderers.push(
            TurnRenderer.buildRenderer('paragraph_renderer', 'system', { text: runtimeState.pending_buffer })
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

    currentRenderer.payload = { text: runtimeState.pending_buffer };
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

    // Check if any block requested the session to continue autonomously
    const updatedState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    if (updatedState.feedback_loop_status === 'continue_requested') {
        // Reset the loop status for the next entry
        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            feedback_loop_status: 'active'
        } as Partial<AISession>);
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'continue' }));
    } else {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
    }
}

async function failStreamingEntry(session_uid: string, error: unknown): Promise<void> {
    AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));

    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    const unfinishedBlock = [...(currentEntry.blocks ?? [])].reverse().find((block) => (
        block.lifecycle_status === AIBlockLifecycleStatus.STARTED
        || block.lifecycle_status === AIBlockLifecycleStatus.STREAMING
    ));

    if (unfinishedBlock && currentSessionState.active_abort_controller) {
        unfinishedBlock.lifecycle_status = AIBlockLifecycleStatus.ABORTED;
        unfinishedBlock.aborted_at = Date.now();
        unfinishedBlock.updated_at = unfinishedBlock.aborted_at;
        unfinishedBlock.runtime_context = {
            ...(unfinishedBlock.runtime_context ?? {}),
            abort_reason: error instanceof Error ? error.message : String(error),
        };
        persistBlock(session_uid, unfinishedBlock);
        await invokeBlockLifecycleHandler(session_uid, unfinishedBlock, 'abort', currentSessionState.active_abort_controller);
    }

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

function isPotentialOpeningTagFragment(buffer: string): boolean {
    return /^<([A-Za-z][\w:-]*)?$/.test(buffer);
}
