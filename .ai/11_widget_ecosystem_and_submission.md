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

### 2. User-Contributed Widgets

User widgets are externally supplied bundles that can be imported and registered at runtime.

User widgets must be treated as untrusted until validated.
They can be enabled, disabled, versioned, and removed without modifying core engine code.

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
