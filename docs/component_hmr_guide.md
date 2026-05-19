# Component HMR Guide

## Goal

Keep Vite React Fast Refresh stable by making `tsx` modules export only React components.

The common failure looks like this:

```text
Could not Fast Refresh ("formatBytes" export is incompatible)
```

That happens when a `tsx` file exports a mix of React components and non-component values such as:

- utility functions
- hooks
- constants
- schemas or local types meant for reuse
- registry metadata as named exports

## Rule Of Thumb

Use this split consistently:

- `*.tsx`: React components only
- `*.ts`: hooks, utility functions, mappers, constants
- `src/shared/schemas/*`: shared types/contracts used by desktop and background
- desktop-only contracts: keep near desktop only when they are truly renderer-specific

## Registry Pattern

For package entry files, avoid named `registry` exports in `tsx` files.

Use the helper pattern instead:

```tsx
import { defineComponent } from '#/lib/define-registry';

function ExamplePanel() {
  return <div />;
}

export default defineComponent(ExamplePanel, {
  name: 'example_panel',
  slug: 'example-panel',
  react_behavior: 'example_panel',
});
```

For window shells:

```tsx
import { defineWindow } from '#/lib/define-registry';

function ExampleWindow({ windowUid }: { windowUid: string }) {
  return <div>{windowUid}</div>;
}

export default defineWindow(ExampleWindow, {
  name: 'example_window',
  slug: 'example-window',
  react_behavior: 'window_shell',
});
```

## Recommended Layout

When a feature needs UI plus data helpers, split it like this:

```text
feature-view.tsx         -> exported React components only
feature-data.ts          -> hooks and utility functions
feature.tsx              -> entry component if needed
src/shared/schemas/...   -> shared types
```

Example already applied:

- `system-runtime-monitor-shared.tsx` now exports only UI helpers
- `system-runtime-monitor-data.ts` contains hook + utility logic
- `src/shared/schemas/runtime-monitor.ts` contains shared types

## Sub-components

Internal sub-components do not need registry metadata.

Good:

```tsx
function SummaryCard() {
  return <div />;
}

function Screen() {
  return <SummaryCard />;
}

export default defineComponent(Screen, {
  name: 'screen',
  slug: 'screen',
  react_behavior: 'screen',
});
```

Only the exported package entry component or window needs registry metadata.

## What To Move Out Of `tsx`

Move these out of `tsx` when reused outside a single local component file:

- `format*`, `resolve*`, `build*`, `map*` utility functions
- hooks like `useSomethingData`
- non-visual state selectors
- shared type aliases and interfaces
- constants and lookup tables

## Audit Notes

Fixed in this cleanup:

- `src/packages/system/components/system-runtime-monitor-shared.tsx`

Still worth reviewing when touched next:

- `src/app-desktop/hooks/use-process-context.tsx`
- `src/app-desktop/hooks/use-window-context.tsx`

Those files currently mix exported provider components with exported hooks/helpers in the same `tsx` module, which is the same class of pattern that can trigger Fast Refresh invalidation.

## Practical Checklist

Before saving a new `tsx` file, check:

1. Does this file export anything other than React components?
2. If yes, should that value move to a sibling `*.ts` file?
3. If this is a package entry file, am I using `defineComponent` or `defineWindow` instead of a named `registry` export?
4. If the type is used by desktop and background, did I place it under `src/shared/schemas`?

If all four are satisfied, HMR should stay stable in normal edits.