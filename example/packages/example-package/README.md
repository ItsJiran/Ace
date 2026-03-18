# Example Package — Hello World

This is a minimal ACE package example. Use it as a starting point for building your own package.

## Structure

```
example-package/
└── registry.json    ← The only required file for ACE to recognize a package
```

## Window Integration Pattern (New)

ACE now uses a Host-Guest architecture (the `window.ACE` bridge) for runtime integration.

- **Do not import internal hooks** from the core.
- **Use the global bridge** `window.ACE.hooks` to access `useAceWindow`.
- This ensures your package is decoupled from the core implementation.

Minimal idea:

```tsx
// 1. Access the hook from the global bridge
const { useAceWindow } = window.ACE.hooks; 

// 2. Build your component
export const MyWindow = ({ windowUid }: { windowUid: string }) => {
  const window = useAceWindow(windowUid);

  return (
    <div {...window.rootProps} style={window.rootStyle}>
      <div onMouseDown={window.dragHandleProps.onMouseDown}>Drag Handle</div>
      <button onClick={window.close}>Close</button>
    </div>
  );
};
```

## Registering Components (Code-Based)

If your package includes code (not just JSON), register your components usage the registry bridge:

```ts
window.ACE.registry.add('my-package', 'widgets', [
  {
    name: 'MyWidget',
    component: MyWindow, // The React component
    // ...
  }
]);
```

Animation bridge is available directly from the same hook:

- `window.animationState`
- `window.playAnimation(sequence)`
- `window.cancelAnimation()`
- `window.retargetAnimation(anchor)`

## registry.json fields

| Field | Required | Description |
|-------|----------|-------------|
| `namespace` | ✅ | `owner/package-name` — globally unique identifier |
| `package_name` | ✅ | Same as namespace (canonical name) |
| `version` | ✅ | Semver string |
| `display_name` | optional | Human-readable name shown in Package Registry UI |
| `author` | optional | Author name |
| `owner_scope` | ✅ | `"user"` for user packages |
| `source_scope` | ✅ | `"config"` for packages loaded from AppConfig |
| `widgets` | optional | Widget bindings (links a component to a window) |
| `components` | optional | React component declarations |
| `windows` | optional | Window presets |
| `tools` | optional | AI-callable tools |
| `features` | optional | Feature flags/registrations |
| `processes` | optional | Background processes |
| `pipelines` | optional | Pipeline definitions |

## Namespace & ID rules

- `namespace` must follow `owner/package-name` format
- Domain entry IDs are **auto-generated** by RegistryEngine if omitted:
  `{domain}:{namespace}:{name}:{versionTag}`
- Example: `tool:example/hello-world:say_hello:v1`

## Install

Run from the project root:

```bash
npm run install-package -- example/packages/example-package
```

This copies your package folder into the ACE AppConfig directory:
`~/.config/com.ace.assistant/packages/example/hello-world/`
