import { AIThreadStreamMethods, WorkflowNodeNames } from '#/shared/schemas/ai';

import type { EmitRecord, NextProtocolSeq, WorkflowNodeName } from './types';

export function isWorkflowNodeName(value?: string): value is WorkflowNodeName {
	return (
		value === WorkflowNodeNames.AGENT ||
		value === WorkflowNodeNames.REASONING ||
		value === WorkflowNodeNames.ROUTER ||
		value === WorkflowNodeNames.ORCHESTRATOR ||
		value === WorkflowNodeNames.EXECUTOR ||
		value === WorkflowNodeNames.OBSERVE
	);
}

function resolveWorkflowStepTitle(node: WorkflowNodeName) {
	if (node === WorkflowNodeNames.REASONING) {
		return 'Reasoning over user intent';
	}

	if (node === WorkflowNodeNames.ROUTER) {
		return 'Routing to next stage';
	}

	if (node === WorkflowNodeNames.ORCHESTRATOR) {
		return 'Planning execution and goals';
	}

	if (node === WorkflowNodeNames.EXECUTOR) {
		return 'Executing selected task';
	}

	if (node === WorkflowNodeNames.OBSERVE) {
		return 'Observing execution output';
	}

	return 'Running agent';
}

export function createWorkflowStepController(input: {
	threadUid: string;
	runId: string;
	nextSeq: NextProtocolSeq;
	emit: EmitRecord;
}) {
	const { threadUid, runId, nextSeq, emit } = input;
	const activeWorkflowStepIds = new Map<string, string>();

	const withRunMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> => ({
		...(metadata ?? {}),
		run_id:
			typeof metadata?.run_id === 'string' && metadata.run_id.trim() ? metadata.run_id : runId,
	});

	return {
		emit(
			event: 'start' | 'finish',
			node: WorkflowNodeName,
			rawPayload?: unknown,
			metadata?: Record<string, unknown>,
		) {
			const stepUid =
				event === 'start'
					? `${threadUid}:${runId}:${node}:step:${nextSeq()}`
					: activeWorkflowStepIds.get(node) ?? `${threadUid}:${runId}:${node}:step:${nextSeq()}`;

			if (event === 'start') {
				activeWorkflowStepIds.set(node, stepUid);
			} else {
				activeWorkflowStepIds.delete(node);
			}

			const seq = nextSeq();
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${seq}`,
				seq,
				method: AIThreadStreamMethods.STEP,
				params: {
					namespace: [],
					timestamp: Date.now(),
					data: {
						event,
						raw_payload: rawPayload,
						metadata: withRunMetadata(metadata),
						step_uid: stepUid,
						node,
						title: resolveWorkflowStepTitle(node),
					},
				},
			});
		},
		finishAll() {
			for (const node of activeWorkflowStepIds.keys()) {
				this.emit('finish', node as WorkflowNodeName, undefined, { run_id: runId });
			}
		},
	};
}

export default createWorkflowStepController;