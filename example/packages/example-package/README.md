# Example Package — Hello World

This is a minimal ACE package example. Use it as a starting point for building your own package.

## Structure

```
example-package/
└── registry.json    ← The only required file for ACE to recognize a package
```

## Window Integration Pattern (New)

ACE now uses a hook bridge pattern for runtime integration.

- For window lifecycle integration, use `useAceWindow`.
- The hook gives you shared runtime behavior (focus, drag, lock, z-index, opacity, animation bridge) without forcing ACE visual styles.
- Your package can fully own rendering and CSS while still staying compatible with the app runtime.

Minimal idea:

```tsx
const window = useAceWindow(windowUid);

return (
  <div {...window.rootProps} style={window.rootStyle}>
    <div onMouseDown={window.dragHandleProps.onMouseDown}>Drag Handle</div>
    <button onClick={window.close}>Close</button>
  </div>
);
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
