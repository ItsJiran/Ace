import { KernelEngine } from '../kernelEngine';
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
 * Per-window animation state held entirely in JS memory (no store).
 * Only committed to the store on animation end/cancel.
 */
interface AnimationSlot {
    sequence: AnimationSequence;
    segIdx: number;
    segStartTime: number;
    segFrom: LiteralBounds | null;
    segTo: LiteralBounds | null;
    holdUntil: number;
    cycles: number;
    retarget: LiteralBounds | null;
    // Cached DOM element reference — avoids getElementById per frame
    element: HTMLElement | null;
}

/**
 * Handles complex window animation sequences (tweening, easing, retargeting).
 * 
 * PERF ARCHITECTURE (v2 — Unified Loop):
 * - One single RAF loop ticks ALL active animations.
 * - Zero store writes during animation (pure DOM manipulation).
 * - DOM element refs are cached per-window.
 * - Runtime state (for DevKit observability) is throttled globally.
 */
export class WindowAnimationController {
    static readonly runtimeMemoryUid = 'system:window_animations';

    static setupKernelSpace(): void {
        KernelEngine.registerSystemMemory(WindowAnimationController.runtimeMemoryUid, {} as Record<string, AnimationRuntimeState>);
    }

    // ─── Core Animation State ───────────────────────────────────────────────
    private slots = new Map<string, AnimationSlot>();
    private liveBounds = new Map<string, LiteralBounds>();

    // ─── Unified Loop ───────────────────────────────────────────────────────
    private loopRaf: number | null = null;
    private lastRuntimeWriteTime = 0;
    private static readonly RUNTIME_STATE_THROTTLE_MS = 500;

    // ─── Callbacks ──────────────────────────────────────────────────────────
    private commitWindowBounds: (uid: string, x: number, y: number, w: number, h: number) => void;
    private closeWindowCb: (uid: string) => void;

    constructor(
        commitWindowBoundsCallback: (uid: string, x: number, y: number, w: number, h: number) => void,
        closeWindowCallback: (uid: string) => void
    ) {
        this.commitWindowBounds = commitWindowBoundsCallback;
        this.closeWindowCb = closeWindowCallback;
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    public isAnimationLocked(window_uid: string): boolean {
        const slot = this.slots.get(window_uid);
        return slot?.sequence.interrupt_policy === 'lock';
    }

    public playAnimation(window_uid: string, sequence: AnimationSequence): void {
        const existing = this.slots.get(window_uid);
        if (existing) {
            if (existing.sequence.interrupt_policy === 'lock') return;
            this.cancelAnimation(window_uid);
        }

        // Verify window exists
        const granular = KernelEngine.readMemory(`system:window:${window_uid}`) as WindowConfig | undefined;
        if (!granular) return;

        // Cache the DOM element reference upfront
        const element = document.getElementById(`window-${window_uid}`);

        const slot: AnimationSlot = {
            sequence,
            segIdx: 0,
            segStartTime: -1,
            segFrom: null,
            segTo: null,
            holdUntil: -1,
            cycles: 0,
            retarget: null,
            element,
        };

        this.slots.set(window_uid, slot);
        this.ensureLoopRunning();
    }

    public cancelAnimation(window_uid: string): void {
        this.finalizeSlot(window_uid);
    }

    public retargetAnimation(window_uid: string, newTo: BoundsAnchor): void {
        const slot = this.slots.get(window_uid);
        if (!slot) return;
        if (slot.sequence.interrupt_policy === 'lock') return;

        const live = this.getLiveBounds(window_uid);
        slot.retarget = this.resolveAnchor(newTo, live);
    }

    // ─── Unified RAF Loop ───────────────────────────────────────────────────

    private ensureLoopRunning(): void {
        if (this.loopRaf !== null) return;
        this.loopRaf = requestAnimationFrame((now) => this.tick(now));
    }

    private tick(now: number): void {
        this.loopRaf = null;

        if (this.slots.size === 0) return; // No animations → stop loop

        // Collect UIDs where the non-looping sequence completed this frame
        const toComplete: Array<{ uid: string; onComplete: AnimationSequence['on_complete'] }> = [];

        // ── Single pass: advance all slots ──
        for (const [uid, slot] of this.slots) {
            // Re-acquire element if missing or unmounted.
            // If not yet in DOM (e.g. spawn queue not flushed), skip this frame —
            // do NOT finalize; the element may appear on the next tick.
            if (!slot.element || !slot.element.isConnected) {
                slot.element = document.getElementById(`window-${uid}`);
                if (!slot.element) continue; // Wait for next frame
            }

            const result = this.advanceSlot(uid, slot, now);
            if (result === 'done') {
                toComplete.push({ uid, onComplete: slot.sequence.on_complete });
            }
        }

        // ── Post-loop: finalize completed animations ──
        for (const { uid, onComplete } of toComplete) {
            // Commit final bounds
            const bounds = this.getLiveBounds(uid);
            this.commitWindowBounds(uid, bounds.x, bounds.y, bounds.width, bounds.height);
            this.removeSlot(uid);

            if (onComplete === 'close_window') {
                this.closeWindowCb(uid);
            } else if (typeof onComplete === 'object' && 'emit_event' in onComplete) {
                // Resolve the window's owning process so the event carries
                // a real process identity (needed for destroy signals, child
                // spawning, memory scoping, etc.).
                const windowEntry = KernelEngine.getWindowEntry(uid);
                EventBus.emit({
                    event_type: 'interaction',
                    action: onComplete.emit_event,
                    process_uid: windowEntry?.process_uid ?? 'system:animation_controller',
                    window_uid: uid,
                    payload: {},
                });
            }
        }

        // ── Throttled runtime state write (one batch for all windows) ──
        if (now - this.lastRuntimeWriteTime >= WindowAnimationController.RUNTIME_STATE_THROTTLE_MS && this.slots.size > 0) {
            this.lastRuntimeWriteTime = now;
            this.writeAllRuntimeStates();
        }

        // Continue loop if there are still active animations
        if (this.slots.size > 0) {
            this.loopRaf = requestAnimationFrame((t) => this.tick(t));
        }
    }

    /**
     * Advance a single animation slot by one frame.
     * Returns 'done' if the sequence has completed (non-loop), otherwise 'continue'.
     */
    private advanceSlot(uid: string, slot: AnimationSlot, now: number): 'continue' | 'done' {
        const { sequence } = slot;
        const segments = sequence.segments;

        // ── End-of-segments check ──
        if (slot.segIdx >= segments.length) {
            if (sequence.loop) {
                slot.segIdx = 0;
                slot.cycles += 1;
            } else {
                return 'done';
            }
        }

        // ── Apply pending retarget ──
        if (slot.retarget) {
            slot.segFrom = { ...this.getLiveBounds(uid) };
            slot.segTo = slot.retarget;
            slot.segStartTime = now;
            slot.retarget = null;
            slot.holdUntil = -1;
        }

        const seg = segments[slot.segIdx];

        // ── Initialize segment on first frame ──
        if (slot.segStartTime < 0 || slot.segFrom === null || slot.segTo === null) {
            const live = this.getLiveBounds(uid);
            slot.segFrom = this.resolveAnchor(seg.from, live);
            slot.segTo = this.resolveAnchor(seg.to, { ...slot.segFrom });
            slot.segStartTime = now;
            slot.holdUntil = -1;
            this.applyBounds(uid, slot, slot.segFrom);
        }

        // ── Hold phase ──
        if (slot.holdUntil > 0) {
            if (now < slot.holdUntil) return 'continue';
            // Hold done → advance
            slot.segIdx += 1;
            slot.segFrom = null;
            slot.segTo = null;
            slot.segStartTime = -1;
            slot.holdUntil = -1;
            return 'continue';
        }

        // ── Interpolation ──
        const rawT = Math.min((now - slot.segStartTime) / seg.duration_ms, 1);
        const easedT = applyEasing(seg.easing, rawT);
        const bounds = this.lerpBounds(slot.segFrom!, slot.segTo!, easedT);
        this.applyBounds(uid, slot, bounds);

        // ── Segment completion ──
        if (rawT >= 1) {
            if (seg.hold_ms > 0) {
                slot.holdUntil = now + seg.hold_ms;
            } else {
                slot.segIdx += 1;
                slot.segFrom = null;
                slot.segTo = null;
                slot.segStartTime = -1;
            }
        }

        return 'continue';
    }

    // ─── DOM & Bounds ───────────────────────────────────────────────────────

    /**
     * Apply bounds to DOM element directly. Zero store writes.
     * Caches bounds in liveBounds map for retarget / live reads.
     */
    private applyBounds(uid: string, slot: AnimationSlot, bounds: LiteralBounds): void {
        this.liveBounds.set(uid, bounds);

        const el = slot.element;
        if (el) {
            el.style.transform = `translate3d(${bounds.x}px, ${bounds.y}px, 0)`;
            el.style.width = `${bounds.width}px`;
            el.style.height = `${bounds.height}px`;
        }
    }

    private getLiveBounds(window_uid: string): LiteralBounds {
        const cached = this.liveBounds.get(window_uid);
        if (cached) return { ...cached };

        const granular = KernelEngine.readMemory(`system:window:${window_uid}`) as WindowConfig | undefined;
        if (granular) return { x: granular.x, y: granular.y, width: granular.width, height: granular.height };

        return { x: 0, y: 0, width: 56, height: 56 };
    }

    // ─── Anchors & Math ─────────────────────────────────────────────────────

    private resolveAnchor(anchor: BoundsAnchor, currentBounds: LiteralBounds): LiteralBounds {
        if (typeof anchor === 'object') return anchor;
        if (anchor === 'current') return { ...currentBounds };

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const { width, height } = currentBounds;

        switch (anchor) {
            case 'screen:center':        return { x: Math.round((vw - width) / 2), y: Math.round((vh - height) / 2), width, height };
            case 'screen:bottom_center': return { x: Math.round((vw - width) / 2), y: Math.round(vh - height - 90), width, height };
            case 'screen:top_center':    return { x: Math.round((vw - width) / 2), y: 32, width, height };
            case 'screen:bottom_left':   return { x: 32, y: Math.round(vh - height - 32), width, height };
            case 'screen:bottom_right':  return { x: Math.round(vw - width - 32), y: Math.round(vh - height - 32), width, height };
            case 'screen:top_left':      return { x: 32, y: 32, width, height };
            case 'screen:top_right':     return { x: Math.round(vw - width - 32), y: 32, width, height };
            default:                     return { ...currentBounds };
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

    // ─── Runtime State (Observability / DevKit) ─────────────────────────────

    private writeAllRuntimeStates(): void {
        const payload: Record<string, AnimationRuntimeState> = {};
        for (const [uid, slot] of this.slots) {
            const seg = slot.sequence.segments[slot.segIdx] ?? slot.sequence.segments[slot.sequence.segments.length - 1];
            payload[uid] = {
                window_uid: uid,
                pattern_id: slot.sequence.pattern_id,
                positioning_mode: slot.sequence.positioning_mode,
                interrupt_policy: slot.sequence.interrupt_policy,
                current_phase: seg?.phase_label ?? 'unknown',
                segment_index: slot.segIdx,
                total_segments: slot.sequence.segments.length,
                loop: slot.sequence.loop,
                cycles: slot.cycles,
                is_running: true,
            };
        }
        KernelEngine.updateMemory(WindowAnimationController.runtimeMemoryUid, payload);
    }

    private writeCompletionState(uid: string, slot: AnimationSlot): void {
        const existing = (KernelEngine.readMemory(WindowAnimationController.runtimeMemoryUid) as Record<string, AnimationRuntimeState> | undefined) ?? {};
        existing[uid] = {
            window_uid: uid,
            pattern_id: slot.sequence.pattern_id,
            positioning_mode: slot.sequence.positioning_mode,
            interrupt_policy: slot.sequence.interrupt_policy,
            current_phase: 'done',
            segment_index: slot.sequence.segments.length - 1,
            total_segments: slot.sequence.segments.length,
            loop: slot.sequence.loop,
            cycles: slot.cycles,
            is_running: false,
        };
        KernelEngine.updateMemory(WindowAnimationController.runtimeMemoryUid, existing);
    }

    private clearAnimationRuntimeState(window_uid: string) {
        const existing = (KernelEngine.readMemory(WindowAnimationController.runtimeMemoryUid) as Record<string, AnimationRuntimeState> | undefined) ?? {};
        delete existing[window_uid];
        KernelEngine.updateMemory(WindowAnimationController.runtimeMemoryUid, existing);
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    private finalizeSlot(uid: string): void {
        const slot = this.slots.get(uid);
        if (slot) {
            this.writeCompletionState(uid, slot);
        }

        // Commit final position to stores
        const bounds = this.getLiveBounds(uid);
        this.commitWindowBounds(uid, bounds.x, bounds.y, bounds.width, bounds.height);

        this.removeSlot(uid);
    }

    private removeSlot(uid: string): void {
        this.slots.delete(uid);
        this.liveBounds.delete(uid);
        this.clearAnimationRuntimeState(uid);
    }
}