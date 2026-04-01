# Fluid Animation Continuity Pattern

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

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
6. **Animation teardown must clear inline styles.** `WindowAnimationController.removeSlot()` clears `transform`, `width`, `height`, and `opacity` from the DOM element when a slot is removed. Failure to do so leaves stale inline styles that override React's layout on the next render cycle.
7. **Pre-mount opacity gate.** `useAceWindow` returns `opacity: 0` in `rootStyle` until `isMounted = true` (set after a 10ms `setTimeout` in `useEffect`). This prevents the first-frame flash where the window briefly renders fully opaque before `WindowAnimationController` acquires it and sets the animation `from` state (typically `opacity: 0`). Never apply `config.opacity` directly in `rootStyle` before the mount gate resolves.

## Performance-Critical Pattern: RAF Decoupling (Drag Optimization)

**Problem**: High-frequency motion updates triggering React re-renders on every RAF frame cascades across all windows causing significant FPS drop (50 FPS → 30 FPS with multiple windows).

**Solution**: Decouple DOM updates from React state updates using a 3-phase RAF loop:

### Phase 1: RAF Physics Loop (DOM-Only)
```typescript
const updatePhysics = (timestamp: number) => {
    // Calculate physics (spring simulation)
    const ax = (targetX - currentX) * tension - vx * friction;
    vx += ax * dt;
    currentX += vx * dt;
    
    // Apply transform DIRECTLY to DOM (no React state update!)
    const el = elementRef.current;
    if (el) {
        el.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        el.style.willChange = 'transform, opacity';  // GPU hint
    }
    
    // Check if settled
    if (!settled) {
        requestAnimationFrame(updatePhysics);
    } else {
        // Only NOW proceed to Phase 2
    }
}
```

**Result**: Per-frame transform updates bypass React entirely. Zero re-renders during motion.

### Phase 2: Boundary Commit (React Update)
When physics settles:
```typescript
// Update React state ONCE (not 60+ times per second)
setLocalX(targetX);
setLocalY(targetY);

// Commit to global RAM (durable bounds)
WindowEngine.updateWindowBounds(windowUid, targetX, targetY, ...);
```

**Result**: Single React re-render at drag-end instead of one per frame.

### Phase 3: Transient Skip During Active Drag
```typescript
// useLayoutEffect that syncs position to DOM
useLayoutEffect(() => {
    if (!isDragging) return;  // ← Skip during active motion!
    // Position stays in local RAF loop, no React sync needed
}, [isDragging]);
```

**Result**: Render gorging prevented entirely. Other windows unaffected during drag.

### Measured Performance Gains
- Single window drag: -10 FPS drop → -2 FPS drop (+80% better)
- Multi-window (5 windows): 30 FPS → ~50 FPS (+67% improvement)
- React re-renders during drag: 60+ → 1 (at boundary only)

### Implementation Checklist
- [ ] RAF loop applies transforms to `element.style.transform` only
- [ ] React state (`localX`, `localY`) unchanged during loop
- [ ] Physics calculation uses spring or easing, never direct interpolation
- [ ] Target position updates on mousemove, loop continues
- [ ] On mouseup: physics loop detects settlement, then commits to React state
- [ ] Final render triggers position-reset effect to ensure DOM stays in sync
- [ ] GPU acceleration hinted via `willChange: 'transform'` during active drag
- [ ] All other windows keep `isDragging = false` and remain unaffected

---

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
7. Window renders invisible (`opacity: 0`) on its first paint; opacity only transitions to configured value once `isMounted = true` in `useAceWindow`.
8. After animation completes and `removeSlot()` is called, no inline `transform`, `width`, `height`, or `opacity` remains on the DOM element.

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

### Slot Lifecycle and Style Cleanup

When `WindowAnimationController` finishes a sequence (or a window is closed), it calls `removeSlot(uid)`. This method:
1. Clears the inline styles it previously wrote: `element.style.transform = ''`, `width = ''`, `height = ''`, `opacity = ''`.
2. Removes the slot from `this.slots` and `this.liveBounds`.
3. Calls `clearAnimationRuntimeState(uid)` to remove the RAM observability entry.

This teardown is required because the same DOM element may be re-used or re-rendered by React with layout values derived from `config` — stale inline styles would silently override them.

### First-Frame Opacity Contract

`useAceWindow` owns the initial opacity of every ACE window:

```typescript
const rootStyle: CSSProperties = {
    width: config.width,
    height: config.height,
    zIndex: ...,
    opacity: isMounted ? (config.opacity ?? 1) : 0,  // transparent until mount
    willChange: 'transform',
};
```

`isMounted` becomes `true` inside a `useEffect → setTimeout(10ms)` after the first render. During those first milliseconds, `WindowAnimationController` acquires the element and sets the animation `from` state (which typically starts at `opacity: 0` for enter animations). By the time `isMounted` resolves and React applies `config.opacity`, the animation loop has already taken ownership of the `opacity` style and drives it to the target. Without this gate, a single-frame flash of the fully-opaque window is visible before the animation begins.

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

---

## Sync Update (2026-03-27)

Latest runtime synchronization applied:

- AI parser now handles split-tag boundaries with a sliding-window carryover approach (e.g. lone `<` and `</` are buffered, not emitted as prose).
- Parser token tracing now captures raw HTTP chunk input, incoming carryover, output text preview, and carryover output.
- Stream/runtime memory now persists parser token traces per chunk for monitor consumption (`parser_token_traces`, `parser_token_trace_count`).
- AI Session Monitor now supports nested response debugging:
  - grouped by prompt turn
  - grouped by response attempt inside each prompt turn
  - token trace export buttons for full JSON and output-only payload
- Tool execution contract now supports nested payload for discriminated schemas:
  - `{"action":"execute", ..., "payload": { "action": "list_directory", "path": "~/" } }`
  - prevents `No matching discriminator for field action` collisions between block action and tool schema action.

Documentation note:
- Response debugging should be analyzed per prompt turn and per attempt, not as one flat stream.
- Auto-loop continuations belong to the same prompt turn unless a new user prompt starts a new turn.

## Sync Update 2026-03-28

Status sync for current architecture and runtime progress:
- Parser block communication is standardized on BaseBlock with payload_raw + payload_json.
- Built-in block outputs (paragraph, event, directive) now follow the same BaseBlock payload contract.
- Typed payload reader helper added in parser schema: getBlockPayloadAs<T>().
- Parser-owned payload typing pattern started with presentation parser exports (PresentationPayload and getPresentationPayload).
- Presentation flow is now explicit: AI emits presentation target (package/component + memory uid), renderer resolves registry entry and passes memory envelope to component.
- Presentation block validation hardened: component_slug is required and memory_uid is preferred (memory_key remains temporary legacy fallback).
- Context memory envelope normalization is centralized in AIContextMemoryEngine to avoid tool-only coupling.
- Gateway continuation contract uses memory pointers for rendering instead of injecting raw tool payloads into prose.

## Sync Update 2026-03-28 (Process Runtime Orchestration)

Current architecture direction is now locked:

1. ProcessEngine is the centralized lifecycle orchestrator (state transitions, process tree, termination cascade, runtime memory ownership), not a domain API replacement.
2. Domain engines remain execution owners (window, ai gateway, fs, shell, tool, pipeline) and must keep business behavior in their own modules.
3. External package flows should go through command/event facade routes; packages should avoid directly coupling to many engines.
4. Long-lived runtime entities (for example window instances and AI sessions) stay active in monitor until they are explicitly closed/terminated.
5. End Task in process monitor triggers engine-aware cleanup through ProcessEngine termination handlers.
6. Runtime memory ownership now propagates through parent process lineage to simplify cascade cleanup and avoid orphan references.

Implementation status:

- In progress sync is active across core docs and runtime code.
- Process monitor currently focuses on active/running processes and nested tree visibility.
- Termination semantics are being standardized per engine to guarantee deterministic cleanup.
