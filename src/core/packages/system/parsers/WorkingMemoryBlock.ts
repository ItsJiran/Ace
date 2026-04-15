import { AIParserProtocolState, type AISession, type AIWorkingMemoryEntry } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
import { KernelEngine } from '#/services/kernelEngine';

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'working_memory',
    slug: 'working_memory',
    description: 'Manage active working memory. Add or remove massive contents (like large files or search results) to keep them visible during the session without inflating standard context.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to manage the "workbench" memory. You can drop memory entries that you no longer need so they stop consuming token context, or add new ones if an external tool didn\'t automatically add them.',
        requiredFields: '"action" (must be "add" or "drop")',
        optionalFields: 'For "add": "uid", "description", "content". For "drop": "uid".',
        triggerConditions: [
            'When you have finished reading a file from working memory and no longer need it, use action:"drop" to free tokens.',
            'When you want to explicitly place text into working memory so you can refer to it in subsequent turns without keeping it in the main chat context.',
        ],
        promptExamples: [
            'I\'m done reading user.ts, I will drop it from working memory.',
            'Let me save this raw API response into working memory so I can analyze it in the next step.'
        ],
        exampleLines: [
            '  @@ace:start working_memory',
            '  {"action": "drop", "uid": "wm_search_result_1"}',
            '  @@ace:end',
            '',
            '  @@ace:start working_memory',
            '  {"action": "add", "uid": "wm_temp_data", "description": "Raw JSON config", "content": "{...}"}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const action = payload.action;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        let wm = [...(sessionState.working_memory || [])];
        const currentTurnIndex = sessionState.turns.length > 0 ? sessionState.turns.length - 1 : 0;

        if (action === 'add') {
            if (!payload.uid || !payload.description || !payload.content) {
                console.warn(`[WorkingMemoryBlock] 'add' requires 'uid', 'description', and 'content'`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            const newEntry: AIWorkingMemoryEntry = {
                uid: payload.uid,
                description: payload.description,
                content: payload.content,
                created_at: Date.now(),
                lifecycle_turn: currentTurnIndex,
            };
            wm = AIGatewayEngine.upsertWorkingMemoryEntry(sessionState, newEntry);
            console.log(`[WorkingMemoryBlock] Added ${payload.uid} to session ${session_uid}`);

        } else if (action === 'drop') {
            if (!payload.uid) {
                console.warn(`[WorkingMemoryBlock] 'drop' requires 'uid'`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            wm = AIGatewayEngine.dropWorkingMemoryEntry(sessionState, payload.uid);
            console.log(`[WorkingMemoryBlock] Dropped ${payload.uid} from session ${session_uid}`);
        } else {
            console.warn(`[WorkingMemoryBlock] Unknown action: ${action}`);
        }

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            working_memory: wm
        } as Partial<AISession>);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[WorkingMemoryBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
