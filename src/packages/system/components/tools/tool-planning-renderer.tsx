import { Braces, ListTodo, Route } from 'lucide-react';

import { MetaGrid, StructuredValueBlock, ToolSection } from './tool-renderer-shared';
import { asArray, asRecord, parseStructuredValue } from './tool-renderer.utils';
import type { ToolRendererProps } from './tool-renderer.utils';

function resolvePlanSteps(value: unknown) {
	const normalizedValue = parseStructuredValue(value);
	const record = asRecord(normalizedValue);
	if (!record) {
		return [] as unknown[];
	}

	return asArray(
		record.steps ?? record.plan ?? record.tasks ?? record.todos ?? record.checklist ?? record.next_steps,
	);
}

export function ToolPlanningRenderer(props: ToolRendererProps) {
	const structuredSource = asRecord(parseStructuredValue(props.artifact)) ?? asRecord(parseStructuredValue(props.content));
	const steps = resolvePlanSteps(props.artifact).length > 0 ? resolvePlanSteps(props.artifact) : resolvePlanSteps(props.content);
	const summary = structuredSource?.summary ?? structuredSource?.goal ?? structuredSource?.thought ?? structuredSource?.reasoning;

	if (steps.length === 0 && !structuredSource) {
		return <ToolGenericRenderer {...props} />;
	}

	return (
		<div className="flex flex-col gap-3">
			<MetaGrid
				items={[
					{ label: 'Summary', value: typeof summary === 'string' ? summary : null },
					{ label: 'Step Count', value: steps.length ? String(steps.length) : null },
				]}
			/>

			{steps.length > 0 ? (
				<div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
					<div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
						<Route size={13} />
						<span>Plan</span>
					</div>
					<div className="flex flex-col gap-2">
						{steps.map((step, index) => {
							const stepRecord = asRecord(step);
							const title =
								typeof step === 'string'
									? step
									: typeof stepRecord?.title === 'string'
										? stepRecord.title
										: typeof stepRecord?.step === 'string'
											? stepRecord.step
											: typeof stepRecord?.task === 'string'
												? stepRecord.task
												: `Step ${index + 1}`;

							return (
								<div key={`${title}-${index}`} className="rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-3">
									<div className="mb-2 flex items-center gap-2 text-sm text-zinc-100">
										<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-medium text-emerald-200">
											{index + 1}
										</span>
										<span>{title}</span>
									</div>
									{typeof step === 'string' ? null : <StructuredValueBlock value={step} />}
								</div>
							);
						})}
					</div>
				</div>
			) : null}

			<ToolSection title="Planning Payload" icon={ListTodo} value={props.content} />
			<ToolSection title="Planning Artifact" icon={Braces} value={props.artifact} />
		</div>
	);
}

import { ToolGenericRenderer } from './tool-generic-renderer';