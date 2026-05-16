import { beforeEach, describe, expect, it } from 'vitest';

import type { AISessionRuntime } from '#/schemas/ai';
import { KernelEngine } from '#/services/kernelEngine';
import { ingestAgentRuntimeEvent } from '#/services/aiGateway/sub-services/interactionParserLoop/agentEventIngestor';

describe('agentEventIngestor', () => {
    beforeEach(() => {
        KernelEngine.resetKernelSpace();
    });

    it('inserts a terminal chain completion before trailing paragraphs when the last activity is chain-related', () => {
        const process = KernelEngine.spawnProcess('ai_session_test');

        KernelEngine.writeMemory('system:ai_session:session-123:state', {
            process_uid: process.process_uid,
            turn_index: 0,
            turns: [{
                assistant_renderers: [
                    {
                        component_slug: 'agent-activity-renderer',
                        package_ref: 'system',
                        payload: {
                            event_key: 'deepagent-activity:chain:reasoner:analysis',
                            event_type: 'chain_started',
                            action: 'analysis',
                        },
                        status: 'running',
                    },
                    {
                        component_slug: 'paragraph_renderer',
                        package_ref: 'system',
                        payload: { text: 'Final answer draft' },
                    },
                ],
                entries: [],
            }],
            context_records: [],
            known_ace_tools: [],
        } as AISessionRuntime);

        ingestAgentRuntimeEvent('session-123', {
            type: 'deepagent_activity',
            event_type: 'chain_finished',
            action: 'finalize',
            status: 'completed',
            payload: {
                role: 'reasoner',
            },
        });

        const nextState = KernelEngine.readMemory('system:ai_session:session-123:state') as AISessionRuntime;
        const nextRenderers = nextState.turns[0]?.assistant_renderers ?? [];

        expect(nextRenderers).toHaveLength(3);
        expect(nextRenderers.map((renderer) => renderer.component_slug)).toEqual([
            'agent-activity-renderer',
            'agent-activity-renderer',
            'paragraph_renderer',
        ]);
        expect((nextRenderers[1]?.payload as Record<string, unknown>)?.event_type).toBe('chain_finished');
    });

    it('also merges later agent activity back above a trailing paragraph when the previous activity block is agent-related', () => {
        const process = KernelEngine.spawnProcess('ai_session_test');

        KernelEngine.writeMemory('system:ai_session:session-456:state', {
            process_uid: process.process_uid,
            turn_index: 0,
            turns: [{
                assistant_renderers: [
                    {
                        component_slug: 'agent-activity-renderer',
                        package_ref: 'system',
                        payload: {
                            event_key: 'deepagent-activity:agent:reasoner:after_model',
                            event_type: 'agent_started',
                            action: 'after_model',
                        },
                        status: 'running',
                    },
                    {
                        component_slug: 'paragraph_renderer',
                        package_ref: 'system',
                        payload: { text: 'Rendered answer body' },
                    },
                ],
                entries: [],
            }],
            context_records: [],
            known_ace_tools: [],
        } as AISessionRuntime);

        ingestAgentRuntimeEvent('session-456', {
            type: 'deepagent_activity',
            event_type: 'agent_finished',
            action: 'finalize_response',
            status: 'completed',
            payload: {
                role: 'reasoner',
            },
        });

        const nextState = KernelEngine.readMemory('system:ai_session:session-456:state') as AISessionRuntime;
        const nextRenderers = nextState.turns[0]?.assistant_renderers ?? [];

        expect(nextRenderers.map((renderer) => renderer.component_slug)).toEqual([
            'agent-activity-renderer',
            'agent-activity-renderer',
            'paragraph_renderer',
        ]);
        expect((nextRenderers[1]?.payload as Record<string, unknown>)?.event_type).toBe('agent_finished');
    });
});