import { beforeEach, describe, expect, it } from 'vitest';
import { handleSessionStreamChunk } from '#/services/aiGateway/streamHandler';
import { AIContextEngine } from '#/services/aiContextEngine';
import { KernelEngine } from '#/services/kernelEngine';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
import type { AISession } from '#/services/aiGateway/types';

describe('AI Gateway history summary protocol', () => {
	beforeEach(() => {
		KernelEngine.resetKernelSpace();
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
				summary_paragraph_threshold: 2,
				prompt_paragraph_count: 2,
				response_paragraph_count: 0,
				require_prompt_summary: true,
				require_response_summary: true,
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

		KernelEngine.writeMemory(ramKey, {
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
		expect(context?.history_summaries.filter((item) => item.block_slug === 'history_summary_ai_response')).toHaveLength(1);
		expect(context?.history_summaries.find((item) => item.block_slug === 'history_summary_ai_response')?.summary).toBe('Jawaban final singkat.');

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
				summary_paragraph_threshold: 2,
				prompt_paragraph_count: 2,
				response_paragraph_count: 0,
				require_prompt_summary: true,
				require_response_summary: true,
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

		KernelEngine.writeMemory(ramKey, {
				text: '',
				raw_response: '',
				blocks: [],
				parser_batches: [],
				parser_batch_count: 0,
				events_total: 0,
				protocol_validation: session.currentProtocolState,
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
		expect(context?.history_summaries.filter((item) => item.block_slug === 'history_summary_ai_prompt')).toHaveLength(1);
		expect(context?.history_summaries.find((item) => item.block_slug === 'history_summary_ai_prompt')?.summary).toBe('User meminta daftar history summary yang dikenal.');

		AIContextEngine.evictContext(sessionId);
	});

	it('recovers prompt and response history summaries from raw response at finalize', () => {
		const sessionId = `sess-test-${crypto.randomUUID()}`;
		const session = {
			sessionId,
			currentProtocolState: {
				request_started_at: Date.now(),
				summary_paragraph_threshold: 2,
				prompt_paragraph_count: 2,
				response_paragraph_count: 0,
				require_prompt_summary: true,
				require_response_summary: true,
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

		const rawResponse = [
			'<history_summary_ai_prompt>',
			'{"summary":"User menanyakan fungsi block.","memory_key":"system:ai_context_rag:payload:ctxref-prompt","ref_uid":"ctxref-prompt"}',
			'</history_summary_ai_prompt>',
			'',
			'Penjelasan user-facing prose.',
			'',
			'<history_summary_ai_response>',
			'{"summary":"Menjelaskan fungsi block runtime.","memory_key":"system:ai_context_rag:payload:ctxref-response","ref_uid":"ctxref-response"}',
			'</history_summary_ai_response>',
		].join('\n');

		const protocol = (AIGatewayEngine as any).finalizeProtocolState(
			session,
			'User menanyakan fungsi block.',
			'Penjelasan user-facing prose.',
			rawResponse,
		);

		expect(protocol).toBeTruthy();
		expect(protocol.prompt_summary_valid).toBe(true);
		expect(protocol.response_summary_valid).toBe(true);
		expect(protocol.fallback_prompt_summary_used).toBe(false);
		expect(protocol.fallback_response_summary_used).toBe(false);
		expect(protocol.violations).not.toContain('Missing required history_summary_ai_prompt block.');
		expect(protocol.violations).not.toContain('Missing required history_summary_ai_response block.');

		const context = AIContextEngine.getSessionContext(sessionId);
		expect(context?.history_summaries.filter((item) => item.block_slug === 'history_summary_ai_prompt')).toHaveLength(1);
		expect(context?.history_summaries.filter((item) => item.block_slug === 'history_summary_ai_response')).toHaveLength(1);

		AIContextEngine.evictContext(sessionId);
	});

	it('recovery uses first valid block when later duplicate blocks are malformed', () => {
		const sessionId = `sess-test-${crypto.randomUUID()}`;
		const session = {
			sessionId,
			currentProtocolState: {
				request_started_at: Date.now(),
				summary_paragraph_threshold: 2,
				prompt_paragraph_count: 2,
				response_paragraph_count: 0,
				require_prompt_summary: true,
				require_response_summary: true,
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

		const rawResponse = [
			'<history_summary_ai_prompt>',
			'{"summary":"Prompt valid awal.","memory_key":"system:ai_context_rag:payload:ctxref-prompt","ref_uid":"ctxref-prompt"}',
			'</history_summary_ai_prompt>',
			'<history_summary_ai_prompt>',
			'{"summary":"Prompt duplikat invalid.","memory_key":"system:wrong","ref_uid":"wrong"}',
			'</history_summary_ai_prompt>',
			'',
			'<history_summary_ai_response>',
			'{"summary":"Response valid awal.","memory_key":"system:ai_context_rag:payload:ctxref-response","ref_uid":"ctxref-response"}',
			'</history_summary_ai_response>',
			'<history_summary_ai_response>',
			'{"summary":"Response duplikat malformed",',
			'</history_summary_ai_response>',
		].join('\n');

		const protocol = (AIGatewayEngine as any).finalizeProtocolState(
			session,
			'Prompt user.',
			'Response user-facing prose.',
			rawResponse,
		);

		expect(protocol).toBeTruthy();
		expect(protocol.prompt_summary_valid).toBe(true);
		expect(protocol.response_summary_valid).toBe(true);
		expect(protocol.fallback_prompt_summary_used).toBe(false);
		expect(protocol.fallback_response_summary_used).toBe(false);

		const context = AIContextEngine.getSessionContext(sessionId);
		expect(context?.history_summaries.find((item) => item.block_slug === 'history_summary_ai_prompt')?.summary).toBe('Prompt valid awal.');
		expect(context?.history_summaries.find((item) => item.block_slug === 'history_summary_ai_response')?.summary).toBe('Response valid awal.');

		AIContextEngine.evictContext(sessionId);
	});

	it('does not require history summary blocks for short turns', () => {
		const sessionId = `sess-test-${crypto.randomUUID()}`;
		const session = {
			sessionId,
			currentProtocolState: {
				request_started_at: Date.now(),
				summary_paragraph_threshold: 2,
				prompt_paragraph_count: 1,
				response_paragraph_count: 0,
				require_prompt_summary: false,
				require_response_summary: false,
				prompt_memory_key: 'system:ai_context_rag:payload:ctxref-prompt-short',
				prompt_ref_uid: 'ctxref-prompt-short',
				response_memory_key: 'system:ai_context_rag:payload:ctxref-response-short',
				response_ref_uid: 'ctxref-response-short',
				prompt_summary_received: false,
				prompt_summary_valid: false,
				response_summary_received: false,
				response_summary_valid: false,
				fallback_prompt_summary_used: false,
				fallback_response_summary_used: false,
				violations: [],
			},
		};

		const protocol = (AIGatewayEngine as any).finalizeProtocolState(
			session,
			'Halo',
			'Hai juga.',
			'Hai juga.',
		);

		expect(protocol).toBeTruthy();
		expect(protocol.require_prompt_summary).toBe(false);
		expect(protocol.require_response_summary).toBe(false);
		expect(protocol.fallback_prompt_summary_used).toBe(false);
		expect(protocol.fallback_response_summary_used).toBe(false);
		expect(protocol.violations).not.toContain('Missing required history_summary_ai_prompt block.');
		expect(protocol.violations).not.toContain('Missing required history_summary_ai_response block.');

		AIContextEngine.evictContext(sessionId);
	});
});
