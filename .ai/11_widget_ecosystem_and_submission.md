# Widget Ecosystem & Submission Model

This document formalizes how ACE treats widgets as first-class modular products.

A widget is not only a visual component. A widget can include:
1. UI components
2. Features (application-level behaviors)
3. Tools (executable capabilities)
4. Optional process/pipeline logic
5. Optional window presets and layout defaults

## Core Principles

1. Widget-as-Package: A widget is a cohesive capability bundle, not just a single React file.
2. Local-First Safety: Widget execution must respect ACE permission and validation gates.
3. Registry-Driven Runtime: Widgets become active only after passing registration contracts.
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
src/core/widgets/
```

Inside that folder, ACE should mirror the same registry-oriented package structure used elsewhere, for example:

```text
src/core/widgets/
├── tools/
├── components/
├── windows/
├── pipelines/
├── features/
├── processes/
└── registry/
```

### 2. User-Contributed Widgets

User widgets are externally supplied bundles that can be imported and registered at runtime.

User widgets must be treated as untrusted until validated.
They can be enabled, disabled, versioned, and removed without modifying core engine code.

Local/user widget packages should live in a parallel workspace-level folder:

```text
widgets/
├── tools/
├── components/
├── windows/
├── pipelines/
├── features/
├── processes/
└── registry/
```

Important rule:
the package may provide the full ecosystem, but it is not required to. Because ACE is multi-registry, a user package may submit only `tools`, only `components`, only `windows`, or any other valid subset.

This rule also applies to the directory model itself:
`tools`, `components`, `windows`, `pipelines`, `features`, `processes`, and `registry` are independent domains.
They are not merely subfolders of a mandatory widget bundle.
Each one must be allowed to exist, be loaded, be validated, and be versioned on its own.

## Widget Package Contract (Conceptual)

Each widget package should expose metadata and capabilities.

Required fields:
1. `widget_id` (stable, namespaced)
2. `version`
3. `display_name`
4. `entry_component`
5. `capability_manifest` (declared tools/features/events)

Optional fields:
1. `default_window_preset`
2. `layout_hints`
3. `snapshot_handlers`
4. `migration_handlers`

## Filesystem Scopes

ACE should treat widget assets as three mirrored scopes:

### 1. Core Scope

Non-removable first-party widgets provided by ACE itself.

```text
src/core/widgets/
```

### 2. Local Package Scope

User/local widget packages discovered from the workspace-level widget folder.

```text
widgets/
```

### 3. Config Scope

Configuration, manifests, enable/disable flags, per-package settings, and future install metadata.

```text
config/widgets/
```

The config scope should mirror the same high-level package topology when needed, so ACE can reason about widget ownership, registry declarations, and user overrides consistently.

Example target shape:

```text
config/widgets/
├── tools/
├── components/
├── windows/
├── pipelines/
├── features/
├── processes/
└── registry/
```

Important clarification:
the mirrored folder names do not imply that all folders must always exist together.
They represent independent registry domains that share a consistent naming convention across scopes.
For example, ACE must allow:
1. a tools-only local submission
2. a components-only local submission
3. a windows-only core package
4. a pipelines-only config declaration

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

5. Standalone Domain Validity
Each registry domain must remain valid even when loaded independently from the others.
ACE should not require a `tool` contribution to also ship a `component`, nor a `window` contribution to also ship a full widget package.

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
