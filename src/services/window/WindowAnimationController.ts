import { StorageEngine } from '../storageEngine';
import { EventBus } from '../eventEngine';
import { applyEasing } from '#/core/patterns/easing';
import type { 
    AnimationSequence, 
    AnimationRuntimeState, 
    BoundsAnchor, 
    LiteralBounds
} from '#/schemas/animation';
import type { WindowConfig } from '#/schemas/window';

/**
 * Handles complex window animation sequences (tweening, easing, retargeting).
 * Decoupled from the main WindowEngine to reduce complexity.
 */
export class WindowAnimationController {
    // Animation runtime state — keyed by window_uid
    private animationRafs = new Map<string, number>();
    private animationSeqs = new Map<string, AnimationSequence>();
    private animationCycles = new Map<string, number>();
    private animationSegmentIndex = new Map<string, number>();
    private animationRetargets = new Map<string, LiteralBounds>();

    // Callback to update window bounds in the main store
    private updateWindowBounds: (uid: string, x: number, y: number, w: number, h: number) => void;
    // Callback to close a window if animation dictates
    private closeWindow: (uid: string) => void;

    constructor(
        updateWindowBoundsCallback: (uid: string, x: number, y: number, w: number, h: number) => void,
        closeWindowCallback: (uid: string) => void
    ) {
        this.updateWindowBounds = updateWindowBoundsCallback;
        this.closeWindow = closeWindowCallback;
    }

    /**
     * Returns true if `window_uid` currently has a running animation with
     * `interrupt_policy: 'lock'`.
     */
    public isAnimationLocked(window_uid: string): boolean {
        const seq = this.animationSeqs.get(window_uid);
        return seq?.interrupt_policy === 'lock';
    }

    /**
     * Resolves a BoundsAnchor (semantic string, "current", or literal) to a
     * concrete LiteralBounds at the moment it is evaluated.
     */
    private resolveAnchor(anchor: BoundsAnchor, currentBounds: LiteralBounds): LiteralBounds {
        if (typeof anchor === 'object') {
            return anchor;
        }

        if (anchor === 'current') {
            return { ...currentBounds };
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        switch (anchor) {
            case 'screen:center':
                return { x: Math.round((vw - currentBounds.width) / 2), y: Math.round((vh - currentBounds.height) / 2), width: currentBounds.width, height: currentBounds.height };
            case 'screen:bottom_center':
                return { x: Math.round((vw - currentBounds.width) / 2), y: Math.round(vh - currentBounds.height - 90), width: currentBounds.width, height: currentBounds.height };
            case 'screen:top_center':
                return { x: Math.round((vw - currentBounds.width) / 2), y: 32, width: currentBounds.width, height: currentBounds.height };
            case 'screen:bottom_left':
                return { x: 32, y: Math.round(vh - currentBounds.height - 32), width: currentBounds.width, height: currentBounds.height };
            case 'screen:bottom_right':
                return { x: Math.round(vw - currentBounds.width - 32), y: Math.round(vh - currentBounds.height - 32), width: currentBounds.width, height: currentBounds.height };
            case 'screen:top_left':
                return { x: 32, y: 32, width: currentBounds.width, height: currentBounds.height };
            case 'screen:top_right':
                return { x: Math.round(vw - currentBounds.width - 32), y: 32, width: currentBounds.width, height: currentBounds.height };
            default:
                return { ...currentBounds };
        }
    }

    private lerpBounds(a: LiteralBounds, b: LiteralBounds, t: number): LiteralBounds {
        return {
            x: Math.round(a.x + (b.x - a.x) * t),
            y: Math.round(a.y + (b.y - a.y) * t),
            width: Math.round(a.width + (b.width - a.width) * t),
            height: Math.round(a.height + (b.height - a.height) * t),
        };
    }

    private writeAnimationRuntimeState(state: AnimationRuntimeState) {
        const existing = (StorageEngine.readMemory('system:window_animations') as Record<string, AnimationRuntimeState> | undefined) ?? {};
        existing[state.window_uid] = state;
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:window_animations',
            payload: existing,
        });
    }

    private clearAnimationRuntimeState(window_uid: string) {
        const existing = (StorageEngine.readMemory('system:window_animations') as Record<string, AnimationRuntimeState> | undefined) ?? {};
        delete existing[window_uid];
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:window_animations',
            payload: existing,
        });
    }

    private getCurrentLiveBounds(window_uid: string): LiteralBounds {
        const wins = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
        const win = wins[window_uid];
        return win ? { x: win.x, y: win.y, width: win.width, height: win.height } : { x: 0, y: 0, width: 56, height: 56 };
    }

    public playAnimation(window_uid: string, sequence: AnimationSequence): void {
        const existing = this.animationSeqs.get(window_uid);

        if (existing) {
            if (existing.interrupt_policy === 'lock') return;
            this.cancelAnimation(window_uid);
        }

        const currentWindows = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        this.animationSeqs.set(window_uid, sequence);
        this.animationCycles.set(window_uid, 0);
        this.animationSegmentIndex.set(window_uid, 0);
        this.animationRetargets.delete(window_uid);

        let segIdx = 0;
        let segStartTime = -1;
        let segFrom: LiteralBounds | null = null;
        let segTo: LiteralBounds | null = null;
        let holdUntil = -1;
        let rafHandle = 0;

        const step = (now: number) => {
            const wins = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
            if (!wins[window_uid]) {
                this.cleanupAnimation(window_uid);
                return;
            }

            const segments = sequence.segments;

            if (segIdx >= segments.length) {
                if (sequence.loop) {
                    segIdx = 0;
                    this.animationCycles.set(window_uid, (this.animationCycles.get(window_uid) ?? 0) + 1);
                } else {
                    const cycles = this.animationCycles.get(window_uid) ?? 0;
                    this.writeAnimationRuntimeState({
                        window_uid,
                        pattern_id: sequence.pattern_id,
                        positioning_mode: sequence.positioning_mode,
                        interrupt_policy: sequence.interrupt_policy,
                        current_phase: 'done',
                        segment_index: segments.length - 1,
                        total_segments: segments.length,
                        loop: sequence.loop,
                        cycles,
                        is_running: false,
                    });
                    this.cleanupAnimation(window_uid);

                    if (sequence.on_complete === 'close_window') {
                        this.closeWindow(window_uid);
                    } else if (typeof sequence.on_complete === 'object' && 'emit_event' in sequence.on_complete) {
                        EventBus.emit({
                            event_type: 'interaction',
                            action: sequence.on_complete.emit_event,
                            window_uid,
                            payload: {},
                        });
                    }
                    return;
                }
            }

            // Apply pending retarget (from retargetAnimation call)
            const retarget = this.animationRetargets.get(window_uid);
            if (retarget) {
                segFrom = { ...this.getCurrentLiveBounds(window_uid) };
                segTo = retarget;
                segStartTime = now;
                this.animationRetargets.delete(window_uid);
                holdUntil = -1;
            }

            const seg = segments[segIdx];
            const liveBounds = this.getCurrentLiveBounds(window_uid);

            // Initialize segment on first frame
            if (segStartTime < 0 || segFrom === null || segTo === null) {
                segFrom = this.resolveAnchor(seg.from, liveBounds);
                segTo = this.resolveAnchor(seg.to, { ...segFrom });
                segStartTime = now;
                holdUntil = -1;
                // Important: Update immediately so there's no frame gap
                this.updateWindowBounds(window_uid, segFrom.x, segFrom.y, segFrom.width, segFrom.height);
            }

            // Hold phase after segment completes
            if (holdUntil > 0) {
                if (now < holdUntil) {
                    rafHandle = requestAnimationFrame(step);
                    this.animationRafs.set(window_uid, rafHandle);
                    return;
                }
                // Hold done, advance segment
                segIdx += 1;
                this.animationSegmentIndex.set(window_uid, segIdx);
                segFrom = null;
                segTo = null;
                segStartTime = -1;
                holdUntil = -1;
                rafHandle = requestAnimationFrame(step);
                this.animationRafs.set(window_uid, rafHandle);
                return;
            }

            const rawT = Math.min((now - segStartTime) / seg.duration_ms, 1);
            const easedT = applyEasing(seg.easing, rawT);
            const nextBounds = this.lerpBounds(segFrom, segTo!, easedT);

            this.updateWindowBounds(window_uid, nextBounds.x, nextBounds.y, nextBounds.width, nextBounds.height);

            this.writeAnimationRuntimeState({
                window_uid,
                pattern_id: sequence.pattern_id,
                positioning_mode: sequence.positioning_mode,
                interrupt_policy: sequence.interrupt_policy,
                current_phase: seg.phase_label,
                segment_index: segIdx,
                total_segments: segments.length,
                loop: sequence.loop,
                cycles: this.animationCycles.get(window_uid) ?? 0,
                is_running: true,
            });

            if (rawT >= 1) {
                if (seg.hold_ms > 0) {
                    holdUntil = now + seg.hold_ms;
                } else {
                    segIdx += 1;
                    this.animationSegmentIndex.set(window_uid, segIdx);
                    segFrom = null;
                    segTo = null;
                    segStartTime = -1;
                }
            }

            rafHandle = requestAnimationFrame(step);
            this.animationRafs.set(window_uid, rafHandle);
        }

        rafHandle = requestAnimationFrame(step);
        this.animationRafs.set(window_uid, rafHandle);
    }

    public cancelAnimation(window_uid: string): void {
        this.cleanupAnimation(window_uid);
    }

    public retargetAnimation(window_uid: string, newTo: BoundsAnchor): void {
        const seq = this.animationSeqs.get(window_uid);
        if (!seq) return;
        if (seq.interrupt_policy === 'lock') return;

        const wins = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
        const win = wins[window_uid];
        if (!win) return;

        const liveBounds: LiteralBounds = { x: win.x, y: win.y, width: win.width, height: win.height };
        const resolved = this.resolveAnchor(newTo, liveBounds);
        this.animationRetargets.set(window_uid, resolved);
    }

    private cleanupAnimation(window_uid: string): void {
        const raf = this.animationRafs.get(window_uid);
        if (raf !== undefined) {
            cancelAnimationFrame(raf);
            this.animationRafs.delete(window_uid);
        }
        this.animationSeqs.delete(window_uid);
        this.animationCycles.delete(window_uid);
        this.animationSegmentIndex.delete(window_uid);
        this.animationRetargets.delete(window_uid);
        this.clearAnimationRuntimeState(window_uid);
    }
}