import { AIThreadStreamMethods, WorkflowNodeNames } from '#/shared/schemas/ai';

import type { EmitRecord, NextProtocolSeq, WorkflowNodeName } from './types';

export function isWorkflowNodeName(value?: string): value is WorkflowNodeName {
	return value === WorkflowNodeNames.AGENT;
}

function resolveWorkflowStepTitle(_node: WorkflowNodeName) {
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

	return {
		emit(event: 'start' | 'finish', node: WorkflowNodeName) {
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
						step_uid: stepUid,
						node,
						title: resolveWorkflowStepTitle(node),
					},
				},
			});
		},
		finishAll() {
			for (const node of activeWorkflowStepIds.keys()) {
				this.emit('finish', node as WorkflowNodeName);
			}
		},
	};
}

export default createWorkflowStepController;