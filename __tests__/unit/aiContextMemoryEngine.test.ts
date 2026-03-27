import { beforeEach, describe, expect, it } from 'vitest';
import { AIContextMemoryEngine } from '#/services/aiContextMemoryEngine';
import { StorageEngine } from '#/services/storageEngine';

function resetStorageEngine() {
    (StorageEngine as any).global_ram.clear();
    (StorageEngine as any).classification_ram.clear();
    (StorageEngine as any).memory_sockets.clear();
    (StorageEngine as any).parent_children.clear();
    (StorageEngine as any).child_parent.clear();
}

function resetContextMemoryEngine() {
    (AIContextMemoryEngine as any).items.clear();
    (AIContextMemoryEngine as any).memoryKeyToUid.clear();
}

describe('AIContextMemoryEngine', () => {
    beforeEach(() => {
        resetStorageEngine();
        resetContextMemoryEngine();
        AIContextMemoryEngine.boot();
    });

    it('stores inline payloads with flexible metadata and filters by status during buildContext', () => {
        const active = AIContextMemoryEngine.createMemory({
            memory_key: 'rag:memory:history:s1:turn-3',
            type: 'conversation_history',
            session_id: 's1',
            status: 'in',
            priority: 'high',
            title: 'Turn 3 summary',
            summary: 'User asked for a parser refactor.',
            payload: [
                { role: 'user', text: 'refactor parser' },
                { role: 'assistant', text: 'working on it' },
            ],
            metadata: {
                turn_number: 3,
                message_count: 2,
            },
            source: 'ai',
            tags: ['history', 'turn-3'],
        });

        AIContextMemoryEngine.createMemory({
            memory_key: 'rag:memory:history:s1:turn-1',
            type: 'conversation_history',
            session_id: 's1',
            status: 'out',
            title: 'Old turn',
            summary: 'Should not enter prompt.',
            payload: { text: 'old' },
            metadata: { turn_number: 1 },
            source: 'ai',
            tags: ['history'],
        });

        expect(AIContextMemoryEngine.getMemory('rag:memory:history:s1:turn-3')?.payload).toEqual([
            { role: 'user', text: 'refactor parser' },
            { role: 'assistant', text: 'working on it' },
        ]);
        expect(AIContextMemoryEngine.getMemory(active.uid)?.metadata).toMatchObject({
            turn_number: 3,
            message_count: 2,
        });
        expect(StorageEngine.readMemory('rag:memory:history:s1:turn-3')).toEqual([
            { role: 'user', text: 'refactor parser' },
            { role: 'assistant', text: 'working on it' },
        ]);

        const result = AIContextMemoryEngine.buildContext({
            sessionId: 's1',
            prompt: 'Current prompt',
            model: 'gpt-test',
            sdk: 'openai',
        });

        expect(result.used_memories).toHaveLength(1);
        expect(result.used_memories[0].uid).toBe(active.uid);
        expect(result.composed_prompt).toContain('[CONTEXT_MEMORY]');
        expect(result.composed_prompt).toContain('Turn 3 summary');
    });

    it('reserveMemory then writeMemoryPayload flips status and payload correctly', () => {
        const item = AIContextMemoryEngine.reserveMemory({
            uid: 'ctxref-test-001',
            memory_key: 'system:ai_context_rag:payload:ctxref-test-001',
            type: 'conversation_history',
            session_id: 's2',
            title: 'Raw assistant response history',
            summary: 'Streaming response buffer',
            payload: { text: '', status: 'reserved' },
            source: 'system',
            source_ref: 'ai_context_rag',
            tags: ['history', 'raw', 'response'],
        });

        expect(item.status).toBe('reserved');
        expect(item.uid).toBe('ctxref-test-001');

        const storageKey = 'system:ai_context_rag:payload:ctxref-test-001';

        const didWrite = AIContextMemoryEngine.writeMemoryPayload(storageKey, {
            text: 'final response',
            blocks: [{ type: 'text' }],
            turn_number: 7,
        }, { status: 'out' });

        expect(didWrite).toBe(true);

        const updated = AIContextMemoryEngine.getMemory(storageKey);
        expect(updated?.status).toBe('out');
        expect(updated?.payload).toEqual({
            text: 'final response',
            blocks: [{ type: 'text' }],
            turn_number: 7,
        });
        expect(StorageEngine.readMemory(storageKey)).toEqual({
            text: 'final response',
            blocks: [{ type: 'text' }],
            turn_number: 7,
        });

        // 'out' items must NOT appear in buildContext
        const result = AIContextMemoryEngine.buildContext({
            sessionId: 's2',
            prompt: 'test prompt',
            model: 'gpt-test',
            sdk: 'openai',
        });
        expect(result.used_memories).toHaveLength(0);
    });
});