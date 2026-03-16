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

## Animation Pattern IDs (Stateful vs Relative)

To avoid ambiguity, every animation pattern must declare a `pattern_id` and a `positioning_mode`.

### Positioning Modes

1. `stateful_fixed`
Definition: Animation is anchored to a fixed, system-defined location (for example lower-center to center).
Behavior: User drag is disabled or ignored for the duration of the sequence.
Use cases: Global prompt bar summon, onboarding hero transitions, system-level alerts.

2. `relative_runtime`
Definition: Animation is anchored relative to the current runtime window position.
Behavior: User can drag while animation is active; animation retargets continuously from live bounds.
Use cases: Widget-local effects, draggable utility windows, interactive contextual prompts.

### ID Convention

Use this format:
`anim:<domain>:<name>:<positioning_mode>:v<version>`

Examples:
1. `anim:prompt_bar:expand_search:stateful_fixed:v1`
2. `anim:window_card:morph_focus:relative_runtime:v1`

### Runtime Contract

Each animation definition should include at least:
1. `pattern_id`
2. `positioning_mode` (`stateful_fixed` or `relative_runtime`)
3. `interrupt_policy` (`lock`, `retarget`, or `cancel`)
4. `anchor_spec`:
stateful mode: semantic anchor (`bottom_center`, `center`, etc.)
relative mode: live origin (`current_window_bounds`) and retarget rule

### Drag Behavior Rules

1. For `stateful_fixed`:
drag should be locked during critical morph phases unless explicitly overridden.
2. For `relative_runtime`:
drag should remain enabled; animation must sample current bounds and continue without reset.
3. If mode changes mid-sequence:
convert from current sampled geometry, never jump back to phase-0 bounds.

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

## WindowEngine Animation Runtime

As of the current implementation, WindowEngine is the sole orchestrator for all window-bound animation sequences. Components do not manage their own RAF loops for spatial motion.

### Schema Location

All types are defined in `src/schemas/animation.ts` (Zod).

Key exported types:
- `AnimationSequence` — the full playable sequence (segments, policy, mode, on_complete)
- `AnimationSegment` — one phase of motion: `phase_label`, `from`, `to`, `easing`, `hold_ms`
- `BoundsAnchor` — `SemanticAnchor | LiteralBounds` — where a segment starts or ends
- `SemanticAnchor` — `'screen:center' | 'screen:bottom_center' | 'current' | ...`
- `EasingType` — `'spring_back' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'linear'`
- `InterruptPolicy` — `'lock' | 'retarget' | 'cancel'`
- `PositioningMode` — `'stateful_fixed' | 'relative_runtime'`
- `AnimationRuntimeState` — written per-frame to RAM key `system:window_animations[uid]`

Pure easing math is in `src/core/patterns/easing.ts`.

### WindowEngine API

```ts
// Play an inline dynamic sequence
WindowEngine.playAnimation(window_uid, sequence: AnimationSequence);

// Stop immediately — window stays at current bounds
WindowEngine.cancelAnimation(window_uid);

// Redirect the current segment to a new target without reset
WindowEngine.retargetAnimation(window_uid, newTo: BoundsAnchor);

// Check if a lock-policy animation is blocking drag
WindowEngine.isAnimationLocked(window_uid): boolean;
```

### BoundsAnchor Resolution

Semantic strings are resolved by WindowEngine at the moment each segment activates — not at call-time. This means screen dimensions are always current:

- `'screen:center'` → center of current viewport, preserving window size
- `'screen:bottom_center'` → lower center with 90px bottom margin
- `'current'` → the window's live bounds at segment start (used for retarget continuity)
- Explicit `{ x, y, width, height }` → passed through unchanged (caller computes at call-time)

### Interrupt Policy Behavior

| Policy | On playAnimation called mid-run | Drag behavior |
|---|---|---|
| `lock` | New call ignored | Drag blocked (isAnimationLocked = true) |
| `retarget` | Snaps from → live bounds, continues toward new target | Drag accepted, retargets continuously during pointer move |
| `cancel` | Cancels immediately, new sequence starts | Drag cancels sequence |

### Observability (DevKit)

Every running animation writes to `system:window_animations` (a `Record<uid, AnimationRuntimeState>`) on each RAF frame. Components can subscribe via `useAceMemory('system:window_animations')` to display live phase, segment index, cycle count, and running state.

Example display: `fps:60 phase:expand cycle:2 run`

### Usage Examples

```ts
// Prompt-bar summon (stateful, locked)
WindowEngine.playAnimation(uid, {
	pattern_id: 'anim:prompt_bar:expand_search:stateful_fixed:v1',
	positioning_mode: 'stateful_fixed',
	interrupt_policy: 'lock',
	loop: false,
	on_complete: 'idle',
	segments: [
		{ phase_label: 'enter',  duration_ms: 500,  from: { x: startX, y: startY, width: 56, height: 56 }, to: 'screen:center', easing: 'spring_back', hold_ms: 0 },
		{ phase_label: 'expand', duration_ms: 620,  from: 'current', to: { x: barX, y: barY, width: 540, height: 64 }, easing: 'spring_back', hold_ms: 0 },
		{ phase_label: 'search', duration_ms: 1900, from: 'current', to: 'current', easing: 'linear', hold_ms: 0 },
		{ phase_label: 'shrink', duration_ms: 520,  from: 'current', to: 'screen:center', easing: 'ease_in_out', hold_ms: 0 },
		{ phase_label: 'exit',   duration_ms: 460,  from: 'current', to: { x: startX, y: startY, width: 56, height: 56 }, easing: 'ease_in', hold_ms: 0 },
	],
});

// Close window after exit animation
WindowEngine.playAnimation(uid, {
	...sequence,
	on_complete: 'close_window',
});

// Redirect mid-flight to follow cursor
WindowEngine.retargetAnimation(uid, { x: cursorX - 28, y: cursorY - 28, width: 56, height: 56 });
```

### Pattern ID Convention

```
anim:<domain>:<name>:<positioning_mode>:v<version>
```

Examples:
- `anim:prompt_bar:expand_search:stateful_fixed:v1`
- `anim:window_card:morph_focus:relative_runtime:v1`
- `anim:widget:slide_in:stateful_fixed:v1`

## Current Stress-Test Progress

Implemented animation continuity stress tests in Dev Kit:
1. `Stress Test: Prompt Bar Animation` (CSS morphology reference)
2. `Stress Test: Prompt Bar Real Window` (WindowEngine geometry sequence)
3. `Stress Test: Animation Interrupt Drag` (policy validation: `lock` / `cancel` / `retarget`)
4. `Stress Test: Relative Modifier Animation` (relative base target drag + persistent bounce modifier)

Relative modifier scenario verifies that motion layers can stack safely:
1. Base target follows drag input (`relative_runtime` semantics).
2. Modifier layer keeps spring/bounce offset active.
3. Retarget loop preserves continuity without snapping back to phase-0 bounds.
