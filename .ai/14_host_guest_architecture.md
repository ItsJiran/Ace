# Host-Guest Architecture & Inversion of Control

This document defines the architectural standard for the User Package Ecosystem (Plugins), moving from a "Widget" model to a strict "Host-Guest" model.

## Core Philosophy

### 1. Inversion of Control (IoC)
Start with the mindset: **The Plugin (Guest) is a library. The App (Host) is the framework.**
- Plugins do not "run" themselves. They export definitions.
- Plugins do not "mount" themselves. They are mounted by the Host into specific Slots.
- Plugins do not "decide" where they appear. The Host's Configuration Engine decides.

### 2. Host-Guest Relationship
- **Host (ACE Core)**: The compiled binary. Owns the Window, the Event Loop, the Global RAM, and the React Tree.
- **Guest (Plugin)**: A JS/TS bundle loaded at runtime. It has no direct access to the Host's internals. It can only communicate via the **Bridge**.

### 3. Hierarchical Slot System
To prevent UI chaos (e.g., plugins opening windows inside buttons), we enforce a strict hierarchy adhering to the **Widget** definition in Pillar 11:

**Hierarchy: Widget ➔ Window ➔ Component**

1.  **Widget (The Unit)**: The top-level composition unit. A plugin registers a *Widget*.
2.  **Window (The Shell)**: The Widget *defines* or *owns* a Window configuration (bounds, chrome, behavior). It interacts with the Host's Window Manager.
3.  **Component (The Content)**: The Window *renders* a Root Component. This Component lives inside the Window's content area.

**Invariant:**
- A **Component** cannot strictly "own" a Window (it renders *inside* one).
- A **Window** cannot exist without a parent **Widget** definition.
- The **Host** manages the Widget lifecycle, which in turn manages the Window, which manages the Component.

---

## The Guest Bridge (API Surface)

The Host exposes a secure, versioned API to Guests. This is the **ONLY** way a plugin interacts with ACE.

```typescript
// global.d.ts (exposed to plugins)
interface AceGuestAPI {
  // 1. Reactivity (Read-Only by default, Write via Actions)
  memory: {
    use: (key: string) => any; // React Hook equivalent
    get: (key: string) => any; // Snapshot
    // No direct .set()! Use Events to request changes.
  };

  // 2. Communication (Fire-and-Forget)
  events: {
    emit: (intent: InteractionSchema) => void;
  };

  // 3. JIT Registration Hooks (Lazy ID Generation)
  hooks: {
    useAceWindow: (config?: Partial<WindowConfig>) => UseAceWindowResult;
    useAceWidget: (config?: WidgetConfig) => UseAceWidgetResult;
  };

  // 4. Registration (Boot-time only)
  registry: {
    // Generic registration for any domain (widgets, tools, pipelines, etc.)
    add: (packageName: string, domain: string, items: unknown[]) => void;
  };
}
```

## Implementation Strategy

### Phase 1: Guest Bridge & JIT Hooks (The ID Generator)
We implement `window.ACE` including `ACE.registry` and `ACE.hooks`.
- **Registry**: Plugins register definitions via `ACE.registry.add('my-pkg', 'tools', [...])`.
- **Lazy Hooks**: When `ACE.hooks.useAceWindow()` is called, the Host manages the coordination.

  1. Detects if `window_uid` is missing.
  2. Generates a stable unique ID (e.g., `guest:<plugin_id>:<uuid>`).
  3. Registers the Window in `System:Windows` RAM.
  4. Returns the ID to the component.

This ensures Plugins don't need to manage IDs manually.

### Phase 2: The Loader (Dynamic Import)
We will use a standard `import()` mechanism or a lightweight module loader (like `SystemJS` if we need robust isolation, or native ESM for modern implementation).

**Directory Structure:**
```text
~/.config/ace/plugins/
  └── weather-widget/
      ├── manifest.json  // capabilities, name, version
      └── main.js        // bundled entry point
```

**Loading Sequence:**
1. **Discovery:** Host scans `manifest.json` files.
2. **Validation:** Host checks permissions (e.g., "Does this plugin need 'network' access?").
3. **Import:** Host runs `import(pluginPath)`.
4. **Registration:** Plugin executes `ACE.registry.register(...)`.
5. **Lock:** Host locks the registry. No more registrations allowed after boot.

### Phase 2: The Slot Component (`<AceSlot />`)
The Host implements a generic wrapper to safely render Guest content.

```tsx
// Host Implementation
const AceSlot = ({ slotId, context }) => {
  const pluginComponent = useRegistry(slotId);

  if (!pluginComponent) return <EmptySlot />;

  return (
    <ErrorBoundary fallback={<PluginCrashError />}>
      <Suspense fallback={<Spinner />}>
        {/* We inject the Bridge Context here if needed */}
        <pluginComponent.Render {...context} />
      </Suspense>
    </ErrorBoundary>
  );
};
```

### Phase 3: Dogfooding (Core-as-Plugin)
To ensure the API is robust, **Core Features** (like the System Console or Settings) should eventually be refactored to use the *exact same* Guest API as external plugins.

## Security Considerations

1. **No DOM Access:** Plugins should ideally not access `document` directly. (Hard to enforce in JS, but we can lint/audit or use Shadow DOM).
2. **Capability-Based Security:**
   - A plugin cannot emit `system:shutdown` unless it has the `system.power` capability in `manifest.json`.
   - The `events.emit()` function checks the plugin's permissions before routing the event.

## Migration Path

1. **Refactor `manifest.json`**: Add `capabilities` array.
2. **Implement `AceGuestBridge`**: Create the global object in `src/boot.ts` or `src/main.tsx` before React mounts.
3. **Update `LoadingWidget`**: Convert it to use the new Slot system as a test case.
