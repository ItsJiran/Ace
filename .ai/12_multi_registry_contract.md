# Multi-Registry Contract

This document formalizes ACE runtime registries beyond component mapping.

ACE supports separate registries per domain so the system stays modular, observable, and safe.

Terminology (final):
1. `widget` = UI composition (`components` + `windows`).
2. `package ecosystem` = one package identity that can wrap all registry domains.

## Why Multi-Registry

Single registries become overloaded and fragile as the ecosystem scales.
ACE uses multiple registries with explicit contracts:
1. Widget Registry
2. Component Registry
3. Feature Registry
4. Tool Registry
5. Process Registry
6. Pipeline Registry
7. Window Registry (runtime state)

Each registry has a different responsibility and lifecycle.

## Registry Responsibilities

### 1. Widget Registry

Purpose:
Maps package widget bindings (`widget_name`, `component_name`, `window_name`) to UI composition metadata.

Stores:
1. Identity and version
2. Component + window linkage
3. Activation status and owner scope (core/user)

### 2. Component Registry

Purpose:
Maps `component_name` to a concrete React component.

Rule:
Component registry handles rendering identity only. It does not authorize capabilities.

### 3. Feature Registry

Purpose:
Maps reusable behaviors/use-cases to executable feature handlers.

Examples:
1. Search orchestration feature
2. Context aggregation feature
3. Widget snapshot feature

### 4. Tool Registry

Purpose:
Maps tool names to schemas and handlers exposed to execution engines.

Rule:
Tools must be schema-validated and permission-aware before execution.

### 5. Process Registry

Purpose:
Tracks observable long-running operations (PID, status, cancellation, dependencies).

Rule:
Process registry is optional tracking; not every action must create a process.

### 6. Pipeline Registry

Purpose:
Tracks named linear pipelines and step-level observability metadata.

### 7. Window Registry

Purpose:
Runtime spatial state in RAM (`system:windows`), including bounds and visual metadata.

## Ownership and Precedence

Recommended precedence for registry resolution:
1. Core (ACE built-in)
2. Default package extensions (trusted first-party)
3. User-contributed packages

Conflict rules:
1. ID collisions are rejected unless explicitly versioned/aliased.
2. User package cannot silently override core IDs.
3. Override requires explicit policy or alias mapping.

## Filesystem Topology Contract

The multi-registry contract should also exist at the directory level, not only in memory.

ACE should maintain three mirrored scopes:

### 1. Core Built-In Scope

```text
src/core/packages/
├── system/
│   └── entry.ts
└── system-dev/
	└── entry.ts
```

Purpose:
non-removable built-in widgets and registry-owned defaults shipped by ACE.

### 2. Local Package Scope

```text
~/.config/com.ace.assistant/packages/
└── <owner>/<package>/dist/index.js
```

Purpose:
user/local submissions and installed packages.

Important:
registries are independent, but terminology must stay strict:
1. `widget package` = UI package focused on `components` + `windows`.
2. `package ecosystem` = one package identity that can bundle cross-domain registries.
3. `standalone domain package` = a single-domain submission (for example only `tools` or only `components`).
Both are valid, but they are not the same classification.

This is the key contract:
`tools`, `components`, `windows`, `pipelines`, `features`, `processes`, and `registry` are standalone registry domains.
They may be shipped together in one package ecosystem identity, or shipped independently as standalone domain packages.
Filesystem validity does not require every sibling domain to exist.

### 3. Config Scope

```text
~/.config/com.ace.assistant/
└── (policy/config metadata)
```

Purpose:
manifest state, enable/disable flags, policy, future installation metadata, and per-scope overrides.

## Scope Resolution Rules

At runtime, precedence should remain:
1. `src/core/packages` (ACE built-in)
2. `~/.config/com.ace.assistant/packages` (local/user submissions)
3. AppConfig policy/config metadata as configuration input, not as an execution override by default

Config may disable or annotate registry entries, but it should not silently replace core handlers without explicit policy.

## Standalone Domain Rules

1. A filesystem scope may provide only `tools/` and omit every other domain.
2. A filesystem scope may provide only `components/` and omit every other domain.
3. A filesystem scope may provide only `windows/`, `pipelines/`, `features/`, `processes/`, or `registry/` and still remain valid.
4. Loaders and validators must treat missing sibling folders as normal, not as an error.
5. The mirrored topology is a naming contract, not a requirement that all domains be present at once.
6. A widget package must declare one package identity/name that groups its included domains.
7. If package includes non-UI domains, classify it as package ecosystem.

## Cross-Registry Linking

A single widget can reference multiple registries:
1. Widget Registry: declares it exists.
2. Component Registry: renders UI entry points.
3. Feature Registry: provides reusable behaviors.
4. Tool Registry: declares executable capabilities.
5. Process/Pipeline Registry: provides runtime observability.

This keeps architecture decoupled while preserving end-to-end traceability.

## Suggested Runtime Contract

A registration request should include:
1. `owner_scope` (`core` | `default` | `user`)
2. `id`
3. `version`
4. `registry_type`
5. `schema_ref` or validator
6. `handler_ref` (if executable)
7. `capability_requirements`
8. `dependency_refs`

## Event and Data Flow Alignment

1. UI opens widget by identity (`open_window` + component/widget metadata).
2. Registry layer resolves implementation and dependencies.
3. Widget actions emit interactions through eventEngine.
4. Feature/tool handlers execute in their domain engines.
5. Results return via storageEngine and optional process registry updates.

## Guardrails

1. No direct cross-registry mutation without validation.
2. No execution for unregistered handlers.
3. Registry entries must be versioned and auditable.
4. High-frequency payloads should still use RAM bypass patterns where applicable.
5. Missing registry entries should degrade gracefully with diagnostic placeholders.

## Adoption Plan

1. Keep current Component Registry as-is.
2. Add typed registry contracts for Widget and Feature.
3. Introduce registration pipeline for user-contributed packages.
4. Add permission review layer for tool-capable widgets.
5. Expose registry diagnostics in Dev Kit for all registry types.
