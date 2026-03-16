import type { EasingType } from '#/schemas/animation';

/**
 * Pure easing utilities for the WindowEngine animation runtime.
 * All functions accept a normalized progress value t ∈ [0, 1] and
 * return an eased progress value.
 */

/** Cubic ease-in — accelerates from rest (exits, gravity-falls). */
export const easeInCubic = (t: number): number => t * t * t;

/** Cubic ease-out — decelerates to rest (lands, settles). */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Cubic ease-in-out — symmetric acceleration/deceleration (shrinks, collapses). */
export const easeInOutCubic = (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * easeOutBack — overshoot and settle (enters, expands).
 * Produces a small spring-like bounce past the target before settling.
 */
export const easeOutBack = (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Identity — no easing applied. */
export const linear = (t: number): number => t;

/**
 * Dispatches to the correct easing function by EasingType discriminant.
 * Used by the WindowEngine RAF loop to evaluate each segment frame.
 */
export const applyEasing = (type: EasingType, t: number): number => {
    switch (type) {
        case 'spring_back':  return easeOutBack(t);
        case 'ease_in':      return easeInCubic(t);
        case 'ease_out':     return easeOutCubic(t);
        case 'ease_in_out':  return easeInOutCubic(t);
        case 'linear':       return linear(t);
    }
};
