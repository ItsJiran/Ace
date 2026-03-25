import { beforeEach, describe, expect, it } from 'vitest';
import { handleSessionStreamChunk } from '#/services/aiGateway/streamHandler';
import { AIContextEngine } from '#/services/aiContextEngine';
import { StorageEngine } from '#/services/storageEngine';
import type { AISession } from '#/services/aiGateway/types';

describe('AI Gateway history summary protocol', () => {
	beforeEach(() => {
		(StorageEngine as any).global_ram.clear();
		(StorageEngine as any).classification_ram.clear();
		(StorageEngine as any).memory_sockets.clear();
	});

	it('keeps the first valid history_summary_ai_response block and ignores later duplicates', () => {
		const sessionId = `sess-test-${crypto.randomUUID()}`;
		const ramKey = `system:test:ai_gateway:${crypto.randomUUID()}`;

		const session: AISession = {
			sessionId,
			sdk: 'openai',
			model: 'gpt-5.4',
			activeOutputRamKey: ramKey,
			activeEventBuffer: '',
			isInsideEventBlock: false,
			status: 'streaming',
			currentProtocolState: {
				request_started_at: Date.now(),
				prompt_memory_key: 'system:ai_context_rag:payload:ctxref-prompt',
				prompt_ref_uid: 'ctxref-prompt',
				response_memory_key: 'system:ai_context_rag:payload:ctxref-response',
				response_ref_uid: 'ctxref-response',
				prompt_summary_received: false,
				prompt_summary_valid: false,
				response_summary_received: false,
				response_summary_valid: false,
				fallback_prompt_summary_used: false,
				fallback_response_summary_used: false,
				violations: [],
			},
		};

		StorageEngine.dispatchRAMAction({
			action: 'create_memory',
			memory_uid: ramKey,
			payload: {
				text: '',
				raw_response: '',
				blocks: [],
				parser_batches: [],
				parser_batch_count: 0,
				events_total: 0,
				response_reference: {
					ref_uid: 'ctxref-response',
					storage_key: 'system:ai_context_rag:payload:ctxref-response',
				},
				protocol_validation: session.currentProtocolState,
			},
			classifications: ['system:test'],
		});

		handleSessionStreamChunk(
			session,
			'<history_summary_ai_response>\n{"summary":"Jawaban final singkat.","memory_key":"system:ai_context_rag:payload:ctxref-response","ref_uid":"ctxref-response"}\n</history_summary_ai_response>\n',
			ramKey,
		);

		handleSessionStreamChunk(
			session,
			'<history_summary_ai_response>\n{"summary":"Duplikat salah.","memory_key":"system:wrong","ref_uid":"wrong-ref"}\n</history_summary_ai_response>\n',
			ramKey,
		);

		const protocol = session.currentProtocolState;
		const context = AIContextEngine.getSessionContext(sessionId);

		expect(protocol?.response_summary_valid).toBe(true);
		expect(protocol?.fallback_response_summary_used).toBe(false);
		expect(protocol?.violations).toContain('Duplicate history_summary_ai_response block ignored after first valid block.');
		expect(context?.history_summaries.filter((item) => item.block_type === 'history_summary_ai_response')).toHaveLength(1);
		expect(context?.history_summaries.find((item) => item.block_type === 'history_summary_ai_response')?.summary).toBe('Jawaban final singkat.');

		AIContextEngine.evictContext(sessionId);
	});

	it('keeps the first valid history_summary_ai_prompt block and ignores later duplicates', () => {
		const sessionId = `sess-test-${crypto.randomUUID()}`;
		const ramKey = `system:test:ai_gateway:${crypto.randomUUID()}`;

		const session: AISession = {
			sessionId,
			sdk: 'openai',
			model: 'gpt-5.4',
			activeOutputRamKey: ramKey,
			activeEventBuffer: '',
			isInsideEventBlock: false,
			status: 'streaming',
			currentProtocolState: {
				request_started_at: Date.now(),
				prompt_memory_key: 'system:ai_context_rag:payload:ctxref-prompt',
				prompt_ref_uid: 'ctxref-prompt',
				response_memory_key: 'system:ai_context_rag:payload:ctxref-response',
				response_ref_uid: 'ctxref-response',
				prompt_summary_received: false,
				prompt_summary_valid: false,
				response_summary_received: false,
				response_summary_valid: false,
				fallback_prompt_summary_used: false,
				fallback_response_summary_used: false,
				violations: [],
			},
		};

		StorageEngine.dispatchRAMAction({
			action: 'create_memory',
			memory_uid: ramKey,
			payload: {
				text: '',
				raw_response: '',
				blocks: [],
				parser_batches: [],
				parser_batch_count: 0,
				events_total: 0,
				protocol_validation: session.currentProtocolState,
			},
			classifications: ['system:test'],
		});

		handleSessionStreamChunk(
			session,
			'<history_summary_ai_prompt>\n{"summary":"User meminta daftar history summary yang dikenal.","memory_key":"system:ai_context_rag:payload:ctxref-prompt","ref_uid":"ctxref-prompt"}\n</history_summary_ai_prompt>\n',
			ramKey,
		);

		handleSessionStreamChunk(
			session,
			'<history_summary_ai_prompt>\n{"summary":"Duplikat prompt salah.","memory_key":"system:wrong","ref_uid":"wrong-ref"}\n</history_summary_ai_prompt>\n',
			ramKey,
		);

		const protocol = session.currentProtocolState;
		const context = AIContextEngine.getSessionContext(sessionId);

		expect(protocol?.prompt_summary_valid).toBe(true);
		expect(protocol?.fallback_prompt_summary_used).toBe(false);
		expect(protocol?.violations).toContain('Duplicate history_summary_ai_prompt block ignored after first valid block.');
		expect(context?.history_summaries.filter((item) => item.block_type === 'history_summary_ai_prompt')).toHaveLength(1);
		expect(context?.history_summaries.find((item) => item.block_type === 'history_summary_ai_prompt')?.summary).toBe('User meminta daftar history summary yang dikenal.');

		AIContextEngine.evictContext(sessionId);
	});
});
