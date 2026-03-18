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

To prevent UI chaos, the Host enforces a strict rendering hierarchy.

```
Widget (entry point — declares the intent)
  └── Window (shell — manages bounds, drag, focus via useAceWindow)
        └── Component (content — pure React UI, no window state)
```

**Invariants:**
- A **Component** does not own a Window. It renders *inside* one.
- A **Window** must be referenced by at least one Widget (or spawned explicitly by `WindowEngine`).
- The **Host** controls the Widget lifecycle → Window lifecycle → Component mount.
- A Widget's `registry` only declares its identity (`widget_name`, `entry_id`). Configuration about windows and launch surfaces belongs to the window preset system or launcher config — not the Widget file itself.

---

## The `window.ACE` Bridge (Guest API Surface)

This is the **only** way a package interacts with ACE at runtime.

```typescript
// Exposed on window.ACE (see src/services/bridge/aceGuestBridge.ts)
interface AceGuestAPI {
    // 1. Reactivity — read RAM, subscribe to changes
    memory: {
        use: <T>(key: string) => T | undefined;  // React Hook (subscribe)
        get: <T>(key: string) => T | undefined;  // Snapshot (no subscription)
        // No direct .set() — request changes via events.emit()
    };

    // 2. Communication — fire-and-forget intents
    events: {
        emit: (intent: { action: string; [key: string]: unknown }) => void;
    };

    // 3. Hooks — JIT window/widget lifecycle binding
    hooks: {
        useAceWindow: (windowUid: string) => UseAceWindowResult;
    };

    // 4. Registration — boot-time only, called by CorePackageLoader / package entry
    registry: {
        registerPackage: (manifest: unknown) => unknown;
        registerPackageModules: (packageName: string, modules: Record<string, unknown>) => void;
        add: (packageName: string, domain: string, items: unknown[]) => void;
    };
}
```

**RAM is read-only for Guests via the bridge.** All writes happen through `events.emit()`, which the Host routes to the appropriate engine (WindowEngine, FSEngine, etc.).

---

## Self-Registering Pattern (Current Implementation)

Core packages (in `src/core/packages/`) use a source-level self-registering pattern:

1. Each package exposes `entry.ts` with `export const manifest` and `export default registerPackage(...)`.
2. `CorePackageLoader` loads each package `entry.ts`, registers manifest via `window.ACE.registry.registerPackage(...)`.
3. Entry bootstrap calls `window.ACE.registry.registerPackageModules(packageName, modules)` to register all domain files.

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

## External Package Loading (Bundled JS)

User-installed packages that are bundled as a single JS file use a different path:

**Directory:**
```text
~/.config/com.ace.assistant/packages/
└── <owner>/<package>/
    └── dist/index.js     ← Bundled entry (exports manifest/bootstrap, references window.ACE)
```

**Loading sequence:**
1. **Discovery** — `RegistryEngine` discovers package entry bundles in AppConfig.
2. **Validation** — Bundle signature/manifest shape is validated.
3. **Import** — Host calls `convertFileSrc()` + dynamic `import(assetUrl)`.
4. **Registration** — Bundle calls `window.ACE.registry.registerPackage(...)` then registers domains via `window.ACE.registry.registerPackageModules(...)` (or `add(...)` manually).
5. **Lock** — Registry is frozen after boot. No late registrations.

External bundles must use `window.ACE.react` (Host-provided React) instead of bundling their own React.

---

## ComponentRegistry Slot (`<AceWindow />`)

The Host renders Guest components inside a generic `<AceWindow />` shell that provides:
- `ErrorBoundary` — crashes are contained per-window, not app-wide
- `Suspense` — lazy-loaded components show a fallback
- window context injection via `windowUid` prop

```tsx
// Simplified — see src/components/layout/AceWindow.tsx
const AceWindow = ({ windowConfig }) => {
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

---

## Security Considerations

1. **Capability Declaration** — Packages declare required capabilities in entry manifest. `events.emit()` checks permissions before routing.
2. **No Internal Imports** — External bundle packages cannot import from `#/services/*` or `#/schemas/*`. Only `window.ACE` is accessible.
3. **Registry Lock** — After boot, `RegistryEngine` rejects any new `registry.add()` calls. Prevents runtime injection attacks.
4. **Error Isolation** — Each window is wrapped in an `ErrorBoundary`. A crashing package cannot take down the whole app.
5. **Validated Schemas** — All registered items are parsed through Zod schemas in `RegistryEngine.registerPackage()` before activation.

---

## Dogfooding Rule

Core packages (`system`, `system-dev`) must use the **same `window.ACE` bridge** that external packages use — no special internal shortcuts. This ensures the bridge API is always production-quality and that core packages are always valid reference implementations.
