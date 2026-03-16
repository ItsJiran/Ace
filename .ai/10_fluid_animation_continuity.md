# Fluid Animation Continuity Pattern

This document defines the animation philosophy for ACE UI transitions so motion feels fluid, responsive, and physically coherent.

The reference mindset is continuity-first motion inspired by modern Apple platform behavior and the Liquid Glass visual language.

## Core Philosophy

Do not treat transitions as static Start-to-End keyframes.
Treat windows and UI elements as living objects that can be re-targeted during interaction.

Primary goals:
1. Continuity: The user should always understand where an element came from and where it is going.
2. Responsiveness: Motion must react immediately to input, not after a delayed animation trigger.
3. Physicality: Prefer spring-based movement over flat easing.
4. Visual Coherence: Layering, blur, and opacity should support legibility and depth without jitter.

## Fluid Transition Phases

### 1. Interaction and Direct Manipulation (Trigger Phase)

Rules:
1. No perceptible waiting window after pointer down / gesture start.
2. Transition state should begin updating immediately while interaction is still active.
3. The UI should hint toward likely destination even before release.

Implementation guidance for ACE:
1. Bind interactive drag/progress values to runtime state or RAF ticks with minimal latency.
2. Keep local transient state for per-frame updates, then commit stable state when interaction ends.
3. Avoid heavy event fan-out for high-frequency motion updates.

### 2. Morphing Phase (Geometry Matching)

Rules:
1. Prefer matched geometry between source and destination states.
2. Interpolate position, width, height, and corner radius as one coherent transform.
3. Preserve identity of the hero element during the morph.

Implementation guidance for ACE:
1. For prompt bar transitions, animate real window bounds using `WindowEngine.updateWindowBounds(...)`.
2. Keep corner radius synchronized with shape state (circle -> pill -> circle).
3. Avoid cross-fading unrelated layers as the primary transition mechanism.

### 3. Physics Phase (Spring First)

Rules:
1. Default to spring-like dynamics instead of linear or generic ease curves.
2. Allow controlled overshoot for natural settling.
3. Support re-targeting mid-transition without visual jumps.

Implementation guidance for ACE:
1. Use spring-like easing for enter/expand motion.
2. Use stable ease for collapse/exit only when visual clarity is better than bounce.
3. If target changes during motion, continue from current sampled bounds rather than resetting to initial state.

### 4. Liquid Glass Visual Finish (Layer Adaptation)

Rules:
1. Motion should be accompanied by contextual depth cues.
2. Background blur/lensing should reinforce focus on the moving object.
3. Opacity transitions for secondary elements must avoid bounce/flicker.

Implementation guidance for ACE:
1. Use backdrop blur and subtle gradient lighting in borderless prompt surfaces.
2. Fade secondary text/icons with monotonic opacity timing (no spring opacity).
3. Keep glow and highlight intensity stable across rapid updates.

## Operational Guardrails

1. Animate only what supports continuity. Avoid decorative motion that does not communicate state.
2. Do not bind heavy business logic to per-frame animation loops.
3. Use RAF for frame-accurate updates when animating real window geometry.
4. Keep motion interruption-safe: replay, cancel, retarget, and close should not produce jumps.
5. Profile FPS during stress scenarios and optimize before adding visual complexity.

## Prompt Bar Real Window Pattern (ACE)

Canonical sequence for prompt bar mockup:
1. Spawn as small circle near lower center.
2. Enter upward to center (spring-like).
3. Morph to elongated bar via width + radius interpolation.
4. Show searching state while holding center geometry.
5. Shrink back to circle.
6. Exit downward with fade.

Design intent:
1. Preserve identity of one object across all phases.
2. Keep user orientation through consistent axis and center anchoring.
3. Ensure motion remains fluid under concurrent system load.

## Acceptance Checklist

1. Motion begins immediately when triggered.
2. Position and size are continuous with no frame jumps.
3. Morph reads as one object, not multiple object swaps.
4. Enter/expand feel spring-based and alive.
5. Fade behavior is clean (no opacity jitter).
6. Transition remains readable and smooth at target FPS.

## Scope Note

This document sets motion principles and implementation direction.
Exact damping, stiffness, durations, and curves can be tuned per component as long as continuity and responsiveness are preserved.
