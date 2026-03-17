# Widget Ecosystem & Submission Model

This document formalizes how ACE treats widgets as first-class modular products.

Terminology (final):
1. `widget` = gabungan `components` + `windows` (UI composition only).
2. `package ecosystem` = wrapper package identity that can include all domains (`tools`, `components`, `windows`, `pipelines`, `features`, `processes`, `registry`).

## Core Principles

1. Widget-as-UI Composition: A widget is a visual/runtime pairing between component and window behavior.
2. Local-First Safety: Widget execution must respect ACE permission and validation gates.
3. Registry-Driven Runtime: Widgets and package ecosystem domains become active only after passing registration contracts.
4. Isolation by Default: Widget state and outputs must be addressable by deterministic IDs.
5. Extensible by Users: End users can contribute and register their own widgets.

## Widget Classes

### 1. Default Widgets (Built-In)

Default widgets are maintained by ACE core and shipped with the app.
Examples:
1. Prompt Widget
2. Settings Widget
3. System Console Widget
4. Diagnostics/Dev Widgets

Default widgets set the baseline UX and act as reference implementations for submission standards.

Built-in widgets are owned by ACE core and are not user-removable.
Their source of truth lives under:

```text
src/core/packages/
```

Inside that folder, ACE should mirror the same package ecosystem structure used elsewhere, for example:

```text
src/core/packages/
├── system/
│   ├── registry.json
│   ├── components/
│   ├── windows/
│   ├── tools/
│   ├── features/
│   ├── processes/
│   └── pipelines/
└── system-dev/
	├── registry.json
	└── components/
```

### 2. User-Contributed Widgets

User widgets are externally supplied bundles that can be imported and registered at runtime.

User widgets must be treated as untrusted until validated.
They can be enabled, disabled, versioned, and removed without modifying core engine code.

Local/user packages are installed into AppConfig and discovered at boot:

```text
~/.config/com.ace.assistant/packages/
└── <owner>/
	└── <package>/
		└── registry.json
```

Important rule:
`widget` means UI composition (`components` + `windows`) under one package identity.

If a submission contains broader domains (`tools`, `pipelines`, `features`, `processes`, `registry`) it should be treated as a **package ecosystem**, not a widget-only package.

Directory model note:
`tools`, `components`, `windows`, `pipelines`, `features`, `processes`, and `registry` are independent domains at loader/registry level.
When grouped under one package identity, the complete wrapper is called `package ecosystem`.

## Widget Package Contract (Conceptual)

Each widget package should expose metadata and capabilities.

Required fields:
1. `namespace` (owner/package)
2. `package_name`
3. `version`
4. `owner_scope`
5. `source_scope`

Optional fields:
1. `display_name`
2. `dependency_refs`
3. `capability_requirements`
4. domain arrays (`widgets`, `components`, `windows`, `tools`, `features`, `processes`, `pipelines`, `registries`)

## Filesystem Scopes

ACE should treat widget assets as three mirrored scopes:

### 1. Core Scope

Non-removable first-party widgets provided by ACE itself.

```text
src/core/packages/
```

### 2. Local Package Scope

User/local packages discovered from AppConfig package install root.

```text
~/.config/com.ace.assistant/packages/
```

### 3. Config Scope

Configuration policy and package-level settings metadata.

```text
~/.config/com.ace.assistant/
└── (policy/config files)
```

Important clarification:
packages are the submission unit, and each package may include only selected domains.

Classification rule:
1. If package only defines UI pairing (`components` + `windows`), it is a `widget` package.
2. If package wraps multiple cross-domain registries, it is a `package ecosystem`.
3. Single-domain submissions remain standalone domain packages.

## Suggested ID Convention

Use namespaced IDs to avoid collisions:
1. `widget:<owner>:<name>:v<major>`
2. `component:<owner>:<name>:v<major>`
3. `tool:<owner>:<name>:v<major>`
4. `feature:<owner>:<name>:v<major>`

Examples:
1. `widget:ace:prompt:v1`
2. `widget:user_jiran:obsidian_assistant:v1`

## User Submission Lifecycle

1. Discover
User provides a widget bundle/manifest.

2. Validate
ACE validates schema, dependency declarations, and permission requirements.

3. Register
Validated entries are inserted into runtime registries (widget/component/tool/feature).

4. Activate
Widget can now be opened through `open_window` and can emit interactions.

5. Observe
Widget execution and tool calls are observable through RAM/process registries.

6. Revoke
Widget can be disabled/uninstalled; related registry entries are removed safely.

## Security and Governance

1. Capability Declaration Required
Widgets must explicitly declare required tools/events. No implicit privileges.

2. Permission Gate
Dangerous capabilities require explicit user consent or policy approval.

3. Boundary Enforcement
Widgets should use public registry contracts, not direct mutation of private engine internals.

4. Versioned Compatibility
Breaking changes should be controlled through versioned IDs and migration hooks.

5. Package Identity Clarity
Widget installations must carry a single package identity/name and version.
Cross-domain submissions must be labeled as package ecosystem packages.

## Runtime Behavior Model

1. Window layer remains dumb and generic.
2. Registry resolves widget/component name into implementation.
3. Widget business logic operates via eventEngine + storageEngine patterns.
4. Tool execution remains governed by domain engines and process observability.

## What This Enables

1. A stable core app with replaceable feature modules.
2. Built-in default widgets for baseline product UX.
3. A user extension ecosystem without coupling to core rendering logic.
4. Clear governance for performance, security, and maintainability.
5. A mirrored directory model across source, local packages, and config state.
