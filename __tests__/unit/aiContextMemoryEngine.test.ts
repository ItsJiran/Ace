import { beforeEach, describe, expect, it } from 'vitest';
import { AIContextMemoryEngine } from '#/services/aiContextMemoryEngine';
import { RegistryEngine } from '#/services/registryEngine';
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

function resetRegistryEngine() {
    (RegistryEngine as any).runtimeIndex.clear();
    (RegistryEngine as any).parserBlockByNamespace.clear();
    (RegistryEngine as any).parserBlockByTag.clear();
    (RegistryEngine as any).schemaByRef.clear();
    (RegistryEngine as any).isBooted = false;
}

function readEnvelopePayload(itemPayload: unknown) {
    if (!itemPayload || typeof itemPayload !== 'object') return undefined;
    return (itemPayload as Record<string, unknown>).payload;
}

describe('AIContextMemoryEngine', () => {
    beforeEach(() => {
        resetStorageEngine();
        resetContextMemoryEngine();
        resetRegistryEngine();
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

        const activeMemory = AIContextMemoryEngine.getMemory('rag:memory:history:s1:turn-3');
        expect(readEnvelopePayload(activeMemory?.payload)).toEqual([
            { role: 'user', text: 'refactor parser' },
            { role: 'assistant', text: 'working on it' },
        ]);
        expect(AIContextMemoryEngine.getMemory(active.uid)?.metadata).toMatchObject({
            turn_number: 3,
            message_count: 2,
        });
        expect(readEnvelopePayload(StorageEngine.readMemory('rag:memory:history:s1:turn-3'))).toEqual([
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
        expect(readEnvelopePayload(updated?.payload)).toEqual({
            text: 'final response',
            blocks: [{ type: 'text' }],
            turn_number: 7,
        });
        expect(readEnvelopePayload(StorageEngine.readMemory(storageKey))).toEqual({
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

    it('records validated schema metadata when schema_ref resolves and payload matches schema', () => {
        RegistryEngine.registerPackage({
            manifest: {
                namespace: 'test/pkg',
                package_name: 'test/pkg',
                version: '1.0.0',
                owner_scope: 'core',
                source_scope: 'core',
            },
            domains: {
                tools: {
                    test_schema: {
                        metadata: {
                            name: 'Test Schema',
                            slug: 'test_schema',
                            schema_ref: 'test/pkg:tools:test_schema:payload',
                            schema_version: '1.0.0',
                            schema_kind: 'json_schema',
                            payload_schema: {
                                type: 'object',
                                required: ['foo'],
                                properties: {
                                    foo: { type: 'string' },
                                },
                            },
                        },
                        implementation: () => null,
                    },
                },
            },
        });

        const item = AIContextMemoryEngine.createMemory({
            memory_key: 'test:schema:ok',
            type: 'custom',
            session_id: 's-schema',
            title: 'Schema validated',
            summary: 'payload should validate',
            payload: { foo: 'bar' },
            metadata: {
                schema_ref: 'test/pkg:tools:test_schema:payload',
                schema_version: '1.0.0',
            },
            source: 'system',
        });

        const envelope = item.payload as Record<string, unknown>;
        expect(envelope.validation_status).toBe('validated');
        expect(envelope.schema_ref).toBe('test/pkg:tools:test_schema:payload');
        expect(envelope.schema_version).toBe('1.0.0');
        expect(AIContextMemoryEngine.getMemory('test:schema:ok', { strictSchemaValidation: true })?.uid).toBe(item.uid);

        const indexPayload = StorageEngine.readMemory('system:ai_context_memory:index') as Array<Record<string, unknown>>;
        const snapshot = indexPayload.find((entry) => entry.uid === item.uid);
        expect(snapshot?.validation_status).toBe('validated');
        expect(snapshot?.schema_ref).toBe('test/pkg:tools:test_schema:payload');

        const metrics = StorageEngine.readMemory('system:ai_context_memory:validation_metrics') as Record<string, unknown>;
        expect(metrics.validated).toBeGreaterThan(0);
    });

    it('marks failed validation for schema_ref miss, version mismatch, and invalid payload in strict mode', () => {
        RegistryEngine.registerPackage({
            manifest: {
                namespace: 'test/pkg2',
                package_name: 'test/pkg2',
                version: '1.0.0',
                owner_scope: 'core',
                source_scope: 'core',
            },
            domains: {
                tools: {
                    test_schema_2: {
                        metadata: {
                            name: 'Test Schema 2',
                            slug: 'test_schema_2',
                            schema_ref: 'test/pkg2:tools:test_schema_2:payload',
                            schema_version: '1.0.0',
                            payload_schema: {
                                type: 'object',
                                required: ['count'],
                                properties: {
                                    count: { type: 'number' },
                                },
                            },
                        },
                        implementation: () => null,
                    },
                },
            },
        });

        const missingRef = AIContextMemoryEngine.createMemory({
            memory_key: 'test:schema:missing',
            type: 'custom',
            session_id: 's-schema',
            title: 'Missing schema ref',
            summary: 'schema ref not found',
            payload: { count: 3 },
            metadata: {
                schema_ref: 'missing/pkg:tools:unknown:payload',
                schema_version: '1.0.0',
            },
            source: 'system',
        });

        const versionMismatch = AIContextMemoryEngine.createMemory({
            memory_key: 'test:schema:version',
            type: 'custom',
            session_id: 's-schema',
            title: 'Version mismatch',
            summary: 'schema version mismatch',
            payload: { count: 3 },
            metadata: {
                schema_ref: 'test/pkg2:tools:test_schema_2:payload',
                schema_version: '2.0.0',
            },
            source: 'system',
        });

        const invalidPayload = AIContextMemoryEngine.createMemory({
            memory_key: 'test:schema:invalid',
            type: 'custom',
            session_id: 's-schema',
            title: 'Payload invalid',
            summary: 'payload fails schema validation',
            payload: { count: 'not-number' },
            metadata: {
                schema_ref: 'test/pkg2:tools:test_schema_2:payload',
                schema_version: '1.0.0',
            },
            source: 'system',
        });

        expect((missingRef.payload as Record<string, unknown>).validation_status).toBe('failed');
        expect((versionMismatch.payload as Record<string, unknown>).validation_status).toBe('failed');
        expect((invalidPayload.payload as Record<string, unknown>).validation_status).toBe('failed');

        expect(AIContextMemoryEngine.getMemory('test:schema:missing', { strictSchemaValidation: true })).toBeNull();
        expect(AIContextMemoryEngine.getMemory('test:schema:version', { strictSchemaValidation: true })).toBeNull();
        expect(AIContextMemoryEngine.getMemory('test:schema:invalid', { strictSchemaValidation: true })).toBeNull();
    });
});