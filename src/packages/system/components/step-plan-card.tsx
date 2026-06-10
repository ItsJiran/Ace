/**
 * StepPlanCard — renders the agent's step plan between chat and composer.
 *
 * Expanded: full checklist with ✓/▶/○ markers
 * Collapsed: mini bar showing active step + running action
 * Hidden: when no steps exist
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import { useStepPlan, type StepPlanData } from '#/app-desktop/hooks/use-step-plan';

interface StepPlanCardProps {
    data: StepPlanData;
}

export function StepPlanCard({ data }: StepPlanCardProps) {
    const [expanded, setExpanded] = useState(true);

    const { steps, activeStep, runningAction, doneCount, totalCount } = data;

    return (
        <div className="flex flex-col border-t border-zinc-700/30 bg-zinc-900/40">
            {/* ── Collapsed: mini bar ─────────────────────────────── */}
            {!expanded && (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-zinc-800/30 transition-colors"
                >
                    <ListChecks className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs text-zinc-400">
                        {activeStep ? (
                            <>
                                <span className="text-amber-400 font-semibold">
                                    Step {steps.findIndex(s => s.id === activeStep.id) + 1}/{totalCount}:
                                </span>{' '}
                                {activeStep.goal}
                                {runningAction && (
                                    <span className="text-zinc-500 ml-1.5">· {runningAction.name}</span>
                                )}
                            </>
                        ) : (
                            <span>
                                {doneCount}/{totalCount} steps done
                            </span>
                        )}
                    </span>
                    <ChevronUp className="w-3 h-3 text-zinc-500 ml-auto rotate-180" />
                </button>
            )}

            {/* ── Expanded: full checklist ────────────────────────── */}
            {expanded && (
                <div className="px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-2">
                        <ListChecks className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                            Plan ({doneCount}/{totalCount})
                        </span>
                        {activeStep && (
                            <span className="text-[10px] text-amber-400 ml-auto">
                                Step {steps.findIndex(s => s.id === activeStep.id) + 1}/{totalCount} active
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setExpanded(false)}
                            className="p-0.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                        >
                            <ChevronDown className="w-3 h-3" />
                        </button>
                    </div>

                    <div className="flex flex-col gap-1">
                        {steps.map((s, i) => {
                            const isActive = s.status === 'active';
                            const isDone = s.status === 'done';

                            return (
                                <div
                                    key={s.id}
                                    className={[
                                        'flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors',
                                        isActive
                                            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                                            : isDone
                                                ? 'text-zinc-500 line-through'
                                                : 'text-zinc-400',
                                    ].join(' ')}
                                >
                                    <span className="w-4 text-center shrink-0">
                                        {isDone ? '✓' : isActive ? '▶' : '○'}
                                    </span>
                                    <span className="flex-1 truncate">{s.goal}</span>
                                    {isActive && runningAction && (
                                        <span className="text-[10px] text-amber-500/70 shrink-0">
                                            · {runningAction.name}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Wrapper that handles null data — renders nothing when no steps. */
export function StepPlanCardWrapper({ currentThreadUid }: { currentThreadUid: string | null }) {
    const data = useStepPlan(currentThreadUid);

    if (!data) return null;
    return <StepPlanCard data={data} />;
}
