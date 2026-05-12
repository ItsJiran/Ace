import { KernelEngine } from '#/services/kernelEngine';
import type { AnimationSequence, EasingType } from '#/schemas/animation';

export type WindowAnimationInterruptPolicy =
    | 'drop'
    | 'replace'
    | 'queue'
    | 'finish-current-then-replace'
    | 'merge-if-compatible';

export type WindowAnimationValues = Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    scale: number;
}>;

export type WindowAnimationStep = {
    key: string;
    values?: WindowAnimationValues;
    transitionMs?: number;
    holdMs?: number;
    easing?: EasingType;
};

export type WindowAnimationSequence = {
    id: string;
    windowUid: string;
    steps: WindowAnimationStep[];
    policy: WindowAnimationInterruptPolicy;
    loop?: boolean;
    source?: string;
    priority?: number;
};

export type WindowAnimationSnapshot = {
    runId: string;
    sequenceId: string;
    stepKey: string;
    values: WindowAnimationValues;
    transitionMs: number;
    easing?: EasingType;
    policy: WindowAnimationInterruptPolicy;
    source?: string;
    startedAt: number;
    targetKeys: Array<keyof WindowAnimationValues>;
};

type ActiveRun = {
    runId: string;
    sequence: WindowAnimationSequence;
    timeoutId: ReturnType<typeof setTimeout> | null;
    targetKeys: Set<keyof WindowAnimationValues>;
};

type WindowQueueState = {
    activeRun: ActiveRun | null;
    queued: WindowAnimationSequence[];
};

class WindowAnimationEngineSingleton {
    private readonly registryMemoryUid = 'system:window_animation_registry';
    private readonly queues = new Map<string, WindowQueueState>();

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.registryMemoryUid, {} as Record<string, WindowAnimationSnapshot>);
    }

    private snapshotMemoryUid(windowUid: string) {
        return `system:window_animation:${windowUid}`;
    }

    private getQueueState(windowUid: string): WindowQueueState {
        let queueState = this.queues.get(windowUid);
        if (!queueState) {
            queueState = {
                activeRun: null,
                queued: [],
            };
            this.queues.set(windowUid, queueState);
        }

        return queueState;
    }

    private buildRunId(sequence: WindowAnimationSequence) {
        return `${sequence.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    }

    private getTargetKeys(sequence: WindowAnimationSequence) {
        const keys = new Set<keyof WindowAnimationValues>();
        for (const step of sequence.steps) {
            if (!step.values) continue;
            for (const key of Object.keys(step.values) as Array<keyof WindowAnimationValues>) {
                keys.add(key);
            }
        }
        return keys;
    }

    private updateRegistry(windowUid: string, snapshot?: WindowAnimationSnapshot) {
        const current = (KernelEngine.readMemory(this.registryMemoryUid) as Record<string, WindowAnimationSnapshot> | undefined) ?? {};
        const next = { ...current };

        if (snapshot) {
            next[windowUid] = snapshot;
        } else {
            delete next[windowUid];
        }

        KernelEngine.writeMemory(this.registryMemoryUid, next);
    }

    private clearActiveTimeout(run: ActiveRun | null) {
        if (run?.timeoutId) {
            clearTimeout(run.timeoutId);
        }
    }

    private finalizeRun(windowUid: string, runId: string) {
        const queueState = this.getQueueState(windowUid);
        if (!queueState.activeRun || queueState.activeRun.runId !== runId) {
            return;
        }

        this.clearActiveTimeout(queueState.activeRun);
        queueState.activeRun = null;
        KernelEngine.deleteMemory(this.snapshotMemoryUid(windowUid));
        this.updateRegistry(windowUid);

        const nextSequence = queueState.queued.shift();
        if (nextSequence) {
            this.startSequence(nextSequence);
            return;
        }

        if (queueState.queued.length === 0) {
            this.queues.delete(windowUid);
        }
    }

    private applyStep(windowUid: string, sequence: WindowAnimationSequence, runId: string, stepIndex: number) {
        const queueState = this.getQueueState(windowUid);
        if (!queueState.activeRun || queueState.activeRun.runId !== runId) {
            return;
        }

        const step = sequence.steps[stepIndex];
        if (!step) {
            if (sequence.loop) {
                this.applyStep(windowUid, sequence, runId, 0);
                return;
            }
            this.finalizeRun(windowUid, runId);
            return;
        }

        const snapshot: WindowAnimationSnapshot = {
            runId,
            sequenceId: sequence.id,
            stepKey: step.key,
            values: step.values ?? {},
            transitionMs: step.transitionMs ?? 0,
            easing: step.easing,
            policy: sequence.policy,
            source: sequence.source,
            startedAt: Date.now(),
            targetKeys: Object.keys(step.values ?? {}) as Array<keyof WindowAnimationValues>,
        };

        KernelEngine.writeMemory(this.snapshotMemoryUid(windowUid), snapshot);
        this.updateRegistry(windowUid, snapshot);

        const holdMs = step.holdMs ?? step.transitionMs ?? 0;
        queueState.activeRun.timeoutId = setTimeout(() => {
            this.applyStep(windowUid, sequence, runId, stepIndex + 1);
        }, Math.max(holdMs, 0));
    }

    private startSequence(sequence: WindowAnimationSequence) {
        const queueState = this.getQueueState(sequence.windowUid);
        const runId = this.buildRunId(sequence);
        const targetKeys = this.getTargetKeys(sequence);

        queueState.activeRun = {
            runId,
            sequence,
            timeoutId: null,
            targetKeys,
        };

        this.applyStep(sequence.windowUid, sequence, runId, 0);
    }

    private isMergeCompatible(activeRun: ActiveRun, nextSequence: WindowAnimationSequence) {
        const nextKeys = this.getTargetKeys(nextSequence);
        if (activeRun.targetKeys.size === 0 || nextKeys.size === 0) {
            return false;
        }

        for (const key of nextKeys) {
            if (activeRun.targetKeys.has(key)) {
                return false;
            }
        }

        return true;
    }

    playSequence(sequence: WindowAnimationSequence) {
        const queueState = this.getQueueState(sequence.windowUid);
        const activeRun = queueState.activeRun;

        if (!activeRun) {
            this.startSequence(sequence);
            return;
        }

        switch (sequence.policy) {
            case 'drop':
                return;
            case 'replace':
                this.clearActiveTimeout(activeRun);
                queueState.queued = [];
                queueState.activeRun = null;
                this.startSequence(sequence);
                return;
            case 'queue':
                queueState.queued.push(sequence);
                return;
            case 'finish-current-then-replace':
                queueState.queued = [sequence];
                return;
            case 'merge-if-compatible':
                if (this.isMergeCompatible(activeRun, sequence)) {
                    queueState.queued.unshift(sequence);
                    return;
                }
                this.clearActiveTimeout(activeRun);
                queueState.queued = [];
                queueState.activeRun = null;
                this.startSequence(sequence);
                return;
            default:
                this.clearActiveTimeout(activeRun);
                queueState.queued = [];
                queueState.activeRun = null;
                this.startSequence(sequence);
        }
    }

    playLegacySequence(windowUid: string, sequence: AnimationSequence) {
        this.playSequence({
            id: sequence.pattern_id,
            windowUid,
            policy: this.mapLegacyPolicy(sequence.interrupt_policy),
            loop: sequence.loop,
            source: 'windowEngine.playAnimation',
            steps: sequence.segments.map((segment) => ({
                key: segment.phase_label,
                values: {
                    x: segment.to.x,
                    y: segment.to.y,
                    width: segment.to.width,
                    height: segment.to.height,
                },
                transitionMs: segment.duration_ms,
                holdMs: segment.hold_ms ?? segment.duration_ms,
                easing: segment.easing,
            })),
        });
    }

    cancelAnimation(windowUid: string) {
        this.clearWindow(windowUid);
    }

    private mapLegacyPolicy(policy: AnimationSequence['interrupt_policy']): WindowAnimationInterruptPolicy {
        switch (policy) {
            case 'queue':
                return 'queue';
            case 'drop':
                return 'drop';
            case 'finish_current':
                return 'finish-current-then-replace';
            case 'retarget':
            default:
                return 'replace';
        }
    }

    clearWindow(windowUid: string) {
        const queueState = this.queues.get(windowUid);
        if (queueState?.activeRun) {
            this.clearActiveTimeout(queueState.activeRun);
        }

        this.queues.delete(windowUid);
        KernelEngine.deleteMemory(this.snapshotMemoryUid(windowUid));
        this.updateRegistry(windowUid);
    }

    playPreset(windowUid: string, preset: 'spawn' | 'focus' | 'restore') {
        switch (preset) {
            case 'spawn':
                this.playSequence({
                    id: 'spawn-enter',
                    windowUid,
                    policy: 'replace',
                    source: 'windowEngine.spawn',
                    steps: [
                        { key: 'spawn-enter', values: { opacity: 0.86, scale: 0.985 }, transitionMs: 90, holdMs: 90 },
                        { key: 'spawn-settle', values: { opacity: 1, scale: 1 }, transitionMs: 160, holdMs: 160 },
                    ],
                });
                return;
            case 'focus':
                this.playSequence({
                    id: 'focus-pulse',
                    windowUid,
                    policy: 'replace',
                    source: 'windowEngine.focus',
                    steps: [
                        { key: 'focus-bump', values: { scale: 1.018 }, transitionMs: 80, holdMs: 80 },
                        { key: 'focus-settle', values: { scale: 1 }, transitionMs: 140, holdMs: 140 },
                    ],
                });
                return;
            case 'restore':
                this.playSequence({
                    id: 'restore-settle',
                    windowUid,
                    policy: 'replace',
                    source: 'windowEngine.restore',
                    steps: [
                        { key: 'restore-enter', values: { opacity: 0.9, scale: 0.985 }, transitionMs: 80, holdMs: 80 },
                        { key: 'restore-done', values: { opacity: 1, scale: 1 }, transitionMs: 180, holdMs: 180 },
                    ],
                });
                return;
        }
    }
}

export const WindowAnimationEngine = new WindowAnimationEngineSingleton();
