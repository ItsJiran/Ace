# Core Widget Design Language

This document defines the visual direction for ACE core widgets.
It focuses on a calm, premium, assistive interface that stays readable and lightweight in both light and dark mode.

## Design Intent

1. Trustworthy: UI should feel stable, reliable, and predictable.
2. Calm: Visual hierarchy is soft, never noisy or over-animated.
3. Assistive: Components should support flow, not compete for attention.
4. Premium Minimal: Spacious layouts, strong typography rhythm, and subtle depth.

## Aesthetic Direction

1. Style: Soft neomorphic-minimal.
2. Core feel: Clean floating cards with airy spacing.
3. Product mood: Notion-level clarity with assistant-like warmth.
4. Visual behavior: Minimal chrome, soft gradients, gentle contrast.

## Theme System

Use dual-theme tokens from day one.
All core widgets must support light and dark themes without layout changes.

### Light Mode Tokens

1. Background: `#F0F2F7`
2. Surface/Card: `#FFFFFF`
3. Primary Accent: `#2952E3`
4. Primary Accent Hover: `#1F45CC`
5. Text Primary: `#171A23`
6. Text Secondary: `#6E7485`
7. Border/Subtle Stroke: `#E3E7F0`
8. Input Ghost Surface: `rgba(255, 255, 255, 0.78)`

### Dark Mode Tokens

1. Background: `#0F121A`
2. Surface/Card: `#171C27`
3. Primary Accent: `#4B72FF`
4. Primary Accent Hover: `#5C82FF`
5. Text Primary: `#E9EDF7`
6. Text Secondary: `#9EA7BE`
7. Border/Subtle Stroke: `#2A3142`
8. Input Ghost Surface: `rgba(23, 28, 39, 0.78)`

### Shared Semantic Rules

1. Accent blue is the only strong chroma for action and emphasis.
2. Secondary text stays muted and never competes with body/action text.
3. Borders are subtle separators, not framing statements.
4. Contrast must remain accessible in both themes.

## Typography

1. Family: Geometric sans-serif, medium-weight system.
2. Character: Clean, modern, no decorative serif usage.
3. Readability first: keep line length moderate and spacing generous.
4. Suggested stack:

```css
font-family: "Manrope", "Sora", "Plus Jakarta Sans", "Inter", sans-serif;
```

## Shape and Depth

1. Border radius:
- Cards/windows: `20px` minimum.
- Pills/bubbles/input: full rounded (`9999px`).
2. Shadows:
- Always soft and diffused.
- Use multi-layer shadows, never harsh single hard shadow.
3. Example shadows:

```css
/* Light */
box-shadow:
  0 10px 30px rgba(25, 35, 58, 0.08),
  0 2px 10px rgba(25, 35, 58, 0.06);

/* Dark */
box-shadow:
  0 14px 34px rgba(0, 0, 0, 0.35),
  0 2px 12px rgba(0, 0, 0, 0.25);
```

## Core Widget Components

### Message Bubbles

1. AI bubble:
- Left aligned.
- Surface card color (light: white, dark: elevated dark surface).
- Soft border + soft shadow.
2. User bubble:
- Right aligned.
- Solid accent blue pill.
- White text with clear contrast.

### Input Bar

1. Shape: Floating pill.
2. Surface: Ghost treatment (translucent but readable).
3. Content: Inline icons + text input.
4. Send action: Filled blue circular button.
5. Focus state: subtle glow/ring from accent token.

### Core Cards and Windows

1. Avoid hard panel segmentation.
2. Use spacing and typography to structure content first.
3. Keep component corners consistently rounded across modules.
4. Window chrome should stay quiet; content area remains the visual center.

## Motion and Interaction

1. Motion principle: subtle and purposeful only.
2. Allowed motion examples:
- Typing indicator dot bounce.
- Soft fade/slide-in on first mount.
- Gentle hover/focus transitions.
3. Avoid:
- Flashy elastic transitions.
- Aggressive parallax.
- Constant animated gradients.
4. Timing guidance:
- Micro transition: `120ms` to `180ms`.
- Entrance transition: `180ms` to `260ms`.
- Easing: `ease-out` or soft cubic curve.

## Tone and UX Behavior

1. The assistant should feel smart but unobtrusive.
2. UI should reduce anxiety, not add urgency.
3. Error and warning visuals should remain calm and informative.
4. Visual consistency is more important than novelty.

## Implementation Notes for Core Widgets

1. Build shared design tokens first, then consume via component variants.
2. Every core widget must pass both light and dark visual review.
3. Keep one source of truth for radii, shadow presets, and accent color.
4. New core widget PRs should include light/dark screenshots.

## Acceptance Checklist

1. Light mode and dark mode both implemented for core widgets.
2. Accent color usage remains single-primary (blue) across critical actions.
3. Bubble alignment and roles are consistent.
4. Input bar uses floating pill style with circular send button.
5. Shadows, radius, and spacing follow the same visual language.
6. Motion stays subtle and does not distract from content.
