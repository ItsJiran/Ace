import { z } from 'zod';

// ============================================================================
// ANIMATION SEQUENCE SCHEMAS
// Governs WindowEngine-driven bound animations following Fluid Continuity rules.
// See .ai/10_fluid_animation_continuity.md for the full design rationale.
// ============================================================================

/**
 * A BoundsAnchor is either:
 * - A semantic string resolved by WindowEngine at play-time based on screen dimensions.
 * - An explicit literal set of coordinates (can be computed at runtime by the caller).
 * - The special string "current" meaning: use the window's live bounds at the time the
 *   segment starts (essential for retarget continuity in relative_runtime mode).
 */
export const SemanticAnchorSchema = z.enum([
    'screen:center',
    'screen:bottom_center',
    'screen:top_center',
    'screen:bottom_left',
    'screen:bottom_right',
    'screen:top_left',
    'screen:top_right',
    'current',          // resolve from live window bounds at segment start
]);

export type SemanticAnchor = z.infer<typeof SemanticAnchorSchema>;

export const LiteralBoundsSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
});

export type LiteralBounds = z.infer<typeof LiteralBoundsSchema>;

export const BoundsAnchorSchema = z.union([SemanticAnchorSchema, LiteralBoundsSchema]);
export type BoundsAnchor = z.infer<typeof BoundsAnchorSchema>;

// ─── Easing ──────────────────────────────────────────────────────────────────

export const EasingTypeSchema = z.enum([
    'spring_back',      // easeOutBack — overshoot and settle (enters, expands)
    'ease_in',          // cubic ease-in — accelerate (exits, gravity)
    'ease_out',         // cubic ease-out — decelerate (lands)
    'ease_in_out',      // cubic ease-in-out — smooth symmetric (shrinks)
    'linear',           // no easing
]);

export type EasingType = z.infer<typeof EasingTypeSchema>;

// ─── Segment ─────────────────────────────────────────────────────────────────

export const AnimationSegmentSchema = z.object({
    /** Human-readable label used for observability (DevKit, logs). */
    phase_label: z.string(),

    duration_ms: z.number().positive(),

    /**
     * Where this segment starts from.
     * "current" uses the window's live bounds at the moment the segment activates —
     * critical for retargeting mid-flight in relative_runtime mode.
     */
    from: BoundsAnchorSchema,

    /** Where this segment animates toward. */
    to: BoundsAnchorSchema,

    easing: EasingTypeSchema.default('ease_in_out'),

    /**
     * Optional hold duration after the segment completes before advancing.
     * Useful for "searching" or "dwell" phases.
     */
    hold_ms: z.number().nonnegative().default(0),
});

export type AnimationSegment = z.infer<typeof AnimationSegmentSchema>;

// ─── Interrupt Policy ────────────────────────────────────────────────────────

/**
 * Determines what happens when the user drags the window while a sequence is running.
 *
 * lock       → drag input is ignored; sequence runs to completion.
 * retarget   → drag is accepted; the current segment's `from` is updated to live bounds,
 *              animation continues from where it is without reset.
 * cancel     → drag immediately cancels the sequence; window is free.
 */
export const InterruptPolicySchema = z.enum(['lock', 'retarget', 'cancel']);
export type InterruptPolicy = z.infer<typeof InterruptPolicySchema>;

// ─── Positioning Mode ────────────────────────────────────────────────────────

/**
 * stateful_fixed   → anchored to system-defined screen positions (semantic anchors).
 *                    Coordinates resolved at play-time from current screen dimensions.
 * relative_runtime → anchored relative to the window's current runtime position.
 *                    Segments typically use "current" for `from`.
 */
export const PositioningModeSchema = z.enum(['stateful_fixed', 'relative_runtime']);
export type PositioningMode = z.infer<typeof PositioningModeSchema>;

// ─── On Complete ─────────────────────────────────────────────────────────────

/**
 * What happens after the last segment finishes (and loop is false).
 *
 * idle         → sequence stops, window stays at final bounds.
 * close_window → WindowEngine closes the window automatically.
 * emit_event   → emits a named event on the EventBus (for AI / engine callbacks).
 */
export const OnCompleteSchema = z.union([
    z.literal('idle'),
    z.literal('close_window'),
    z.object({ emit_event: z.string() }),
]);

export type OnComplete = z.infer<typeof OnCompleteSchema>;

// ─── Full Sequence ────────────────────────────────────────────────────────────

export const AnimationSequenceSchema = z.object({
    /**
     * Unique ID following pillar 10 convention:
     * `anim:<domain>:<name>:<positioning_mode>:v<version>`
     * e.g. "anim:prompt_bar:expand_search:stateful_fixed:v1"
     */
    pattern_id: z.string(),

    positioning_mode: PositioningModeSchema,

    interrupt_policy: InterruptPolicySchema.default('lock'),

    /** If true, sequence restarts from segment 0 after the last segment completes. */
    loop: z.boolean().default(false),

    on_complete: OnCompleteSchema.default('idle'),

    segments: z.array(AnimationSegmentSchema).min(1),
});

export type AnimationSequence = z.infer<typeof AnimationSequenceSchema>;

// ─── Runtime State (written to RAM for observability) ─────────────────────────

export const AnimationRuntimeStateSchema = z.object({
    window_uid: z.string(),
    pattern_id: z.string(),
    positioning_mode: PositioningModeSchema,
    interrupt_policy: InterruptPolicySchema,
    current_phase: z.string(),
    segment_index: z.number(),
    total_segments: z.number(),
    loop: z.boolean(),
    cycles: z.number(),
    is_running: z.boolean(),
});

export type AnimationRuntimeState = z.infer<typeof AnimationRuntimeStateSchema>;
