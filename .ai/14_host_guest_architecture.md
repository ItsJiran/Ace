# Host-Guest Architecture & Inversion of Control

This document defines the architectural contract between the ACE core (Host) and any package (Guest).

See also: `11_package_ecosystem_and_submission.md` for the full package structure and submission model.

## Core Philosophy

### 1. Inversion of Control (IoC)
**The Package (Guest) is a library. The App (Host) is the framework.**

- Packages do not run themselves. They export declarations.
- Packages do not mount themselves. They are mounted by the Host via the ComponentRegistry and WindowEngine.
- Packages do not decide where they appear. The Host's RegistryEngine and launcher configuration decides.

### 2. Host-Guest Relationship

| Role | Responsibility |
|---|---|
| **Host (ACE Core)** | Compiled binary. Owns the Window, Event Loop, Global RAM, React Tree, and registry. |
| **Guest (Package)** | Source files or JS bundle loaded at boot. Has no direct access to Host internals. Communicates only via the `window.ACE` bridge. |

### 3. Hierarchy: Widget → Window → Component

To prevent UI chaos, the Host enforces a strict rendering hierarchy with clear role separation.

**Terminology (from Package Ecosystem model):**

- **Widget** — UI entry point identity that tells the system *what* to show and *when* (Start Menu, auto-start, command palette, etc.). Declares intent only (`widget_name`, `entry_id`). Configuration about windows and launch surfaces belongs to the window preset system or launcher config — not the Widget file itself.
- **Window** — Shell wrapper that binds a component to the window lifecycle (`useAceWindow`). Manages bounds, drag, focus, and spawn/close events. One per spawnable window type.
- **Component** — Pure React UI content rendered inside a window. Owns its own visual logic and state. Does not manage window state or bounds.

**Rendering hierarchy:**

```
Widget (entry point — declares the intent)
  └── Window (shell — manages lifecycle via useAceWindow)
        └── Component (content — pure React UI)
```

**Invariants:**
- A **Component** does not own a Window. It renders *inside* one.
- A **Window** must be referenced by at least one Widget (or spawned explicitly by `WindowEngine`).
- A **Widget's** `registry` only declares identity. Launch config (surfaces, startup_policy, visibility) is NOT in the Widget—it belongs in window presets or launcher configuration.
- The **Host** controls the entire Widget lifecycle → Window lifecycle → Component mount chain.

---

## The `window.ACE` Bridge (Guest API Surface)

This is the **only** way a package interacts with ACE at runtime.

```typescript
// Exposed on window.ACE (initialized in src/boot.ts)
interface AceAPI {
    registry: RegistryEngine; // For package registration (registerPackage, registerPackageModules)
    widget: WidgetEngine;     // For UI Component lookup
    tool: ToolEngine;         // For Tool validation & lookup
    process: ProcessEngine;   // For Process registration & lifecycle
    window: WindowEngine;     // For Window management
    event: EventBus;          // For Interaction routing
    storage: StorageEngine;   // For RAM access
    PipelineEngine: Class<PipelineEngine>; // For Pipeline creation
}
```

---

---

## Self-Registering Pattern (Current Implementation)

All packages — core and user — follow the same self-registering file pattern defined in the Package Ecosystem model:

1. **Each domain file** exports two things:
   - `export const registry` — minimal identity declaration, typed via `AceRegistryType`
   - `export default` — the main callable (React component, async function, etc.)

2. **Package entry (`entry.ts`)** orchestrates registration:
   - Declares `export const manifest` with package-level metadata
   - Calls `window.ACE.registry.registerPackage(manifest)` to register package identity
   - Calls `window.ACE.registry.registerPackageModules(packageName, modules)` to auto-discover and register all domain files

3. **At boot**, `RegistryEngine` loads each package `entry.ts` and executes it.

This means **no manual wiring** — adding a file to the right folder is enough.

```typescript
// src/core/packages/system/tools/MyTool.ts
import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Tool = {
    tool_name: 'my_tool',
    description: 'Does something useful.',
};

export default async function myTool(params: { input: string }) {
    // implementation
}
```

---

## External Package Loading (User-Installed Packages)

User-installed packages are discovered from AppConfig and follow the same self-registering pattern as core packages:

**Directory structure:**
```text
~/.config/com.ace.assistant/packages/
└── <owner>/<package>/
    ├── entry.ts          ← Package manifest + bootstrap (or bundled as dist/index.js)
    ├── widgets/
    ├── components/
    ├── windows/
    ├── tools/
    └── ...
```

**Loading sequence:**
1. **Discovery** — `RegistryEngine` discovers package directories in AppConfig.
2. **Validation** — Package manifest is validated against entry schema.
3. **Registration** — Package `entry.ts` (or bundled entry point) is executed:
   - Calls `window.ACE.registry.registerPackage(manifest)` to register package identity
   - Calls `window.ACE.registry.registerPackageModules(packageName, modules)` to register all domains
4. **Activation** — Domains are live. Widgets appear in launchers, tools are callable, windows are spawnable.
5. **Lock** — Registry is frozen after boot. No late registrations allowed (prevents injection attacks).

External packages must not bundle their own React — they must use `window.ACE.react` (Host-provided).

---

## Runtime: Widget → Window → Component Flow

When a Widget is activated (clicked in Start Menu, auto-spawn, etc.), the Host orchestrates this flow:

1. **Widget activation** — User clicks widget or system auto-triggers it.
2. **Window spawn** — Host looks up the window preset for that widget, creates window instance via `WindowEngine`.
3. **Component resolution** — Host resolves the `component_name` for that window via `ComponentRegistry`.
4. **Component mount** — Component is rendered inside the window shell (which calls `useAceWindow`).

The `ComponentRegistry` is the runtime resolver:

```tsx
// Simplified — see src/components/layout/AceWindow.tsx
const AceWindow = ({ windowConfig }) => {
    // Dynamically resolve component by name from registry
    const Component = ComponentRegistry.resolve(windowConfig.component_name);

    return (
        <ErrorBoundary fallback={<WindowCrashError />}>
            <Suspense fallback={<LoadingWidget />}>
                <Component windowUid={windowConfig.window_uid} />
            </Suspense>
        </ErrorBoundary>
    );
};
```

**Key points:**
- **Widget** only declares intent (name, id). It has no knowledge of windows.
- **Window** knows which component to render (`component_name`) and manages the window lifecycle.
- **Component** is pure UI — it receives `windowUid` to call `useAceWindow` if needed, but doesn't own the window.
- Errors crash only the window, not the whole app (via `ErrorBoundary`).

---

## Security and Governance

1. **Boundary Enforcement** — Packages communicate via `window.ACE` bridge only. No direct mutation of engine internals or imports from `#/services/*` / `#/schemas/*`.
2. **Capability Declaration** — Packages declare required capabilities in entry manifest. Dangerous capabilities (filesystem, network) require explicit user consent.
3. **Validated Schemas** — All registered items are parsed through Zod schemas in `RegistryEngine.registerPackage()` before activation.
4. **Registry Lock** — After boot, `RegistryEngine` rejects any new registrations. Prevents runtime injection attacks.
5. **Error Isolation** — Each window is wrapped in an `ErrorBoundary`. A crashing package cannot take down the whole app or other windows.
6. **Package Identity Clarity** — One `entry.ts` manifest per package. No ambiguous multi-package bundles.
7. **Versioned Compatibility** — Breaking changes use versioned IDs. Old consumers continue working until explicitly migrated.

---

## Dogfooding Rule

Core packages (`system`, `system-dev`) must use the **same `window.ACE` bridge** that external packages use — no special internal shortcuts. This ensures the bridge API is always production-quality and that core packages are always valid reference implementations.
