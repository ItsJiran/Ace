# Code Principles

This document defines the architectural code principles used in ACE. The goal is to keep runtime boundaries explicit, reduce accidental coupling, and make the codebase easier to evolve while the product is still experimental.

## 1. Separate by Runtime Ownership

ACE has multiple runtime surfaces, so files should be organized by ownership first.

- `src/shared/*` contains contracts, schemas, abstractions, and utilities that are intentionally used by more than one runtime.
- `src/app-desktop/*` contains desktop renderer behavior, UI runtime code, and renderer-owned orchestration.
- `src/app-background/*` contains background runtime logic, orchestration, tool execution, and background-only transport code.
- `electron/*` contains Electron main-process hosting, process bridging, preload behavior, and OS-facing integration.

A file should live in the runtime that owns the behavior, not in the runtime that merely consumes the result.

## 2. Shared Code Is Not Shared Memory

The `shared` folder is a code-sharing boundary, not a memory-sharing boundary.

- Shared schemas define contracts.
- Shared constants define stable names and values.
- Shared abstractions provide reusable mechanisms.
- Shared runtime state does **not** imply shared process memory.

Desktop renderer and background runtime still execute in different processes with different module instances.

## 3. Schemas, Types, and Constants Have Different Jobs

These concepts should be kept separate instead of blended into large miscellaneous files.

### Schemas

Schemas define runtime contracts.

Use schemas when:
- validating payloads
- documenting transport messages
- defining structured registry entries
- protecting runtime boundaries

Place schemas close to the boundary they represent:
- `src/shared/schemas/*` for cross-runtime or cross-package contracts
- `src/app-background/schemas/*` for background-only transport or runtime contracts
- `src/app-desktop/*` for desktop-only host bridge behavior when the contract is not shared

### Types

Types express compile-time intent.

Use types when:
- you need aliases, mapped types, discriminated unions, or ergonomic signatures
- runtime validation is unnecessary
- the shape is internal and purely developer-facing

Types may live next to schemas, but they should not replace schemas for transport boundaries.

### Constants

Constants define stable identifiers and shared values.

Use constants when:
- event names should not drift
- registry domain values must stay centralized
- runtime modes or fixed labels are reused across modules
- magic strings would otherwise leak into many files

Constants should be centralized when they represent shared vocabulary.

## 4. Engines Own Behavior, Not Just Helpers

An `Engine` should represent a real runtime surface or orchestration boundary.

Good engine traits:
- owns state or lifecycle
- exposes a stable API
- aligns with one runtime responsibility
- can be reasoned about as a subsystem

Engines should not become generic dumping grounds for unrelated helpers.

### Naming rule

If a module is treated like a subsystem and follows the engine lifecycle pattern, it should use the `*Engine` suffix and follow the class-based singleton convention used across ACE.

Examples:
- `KernelEngine`
- `AIEngine`
- `WindowEngine`

If a module is only a helper or adapter, it should not be named as an engine.

## 5. Use RPC for Commands, Events for Notifications

Do not blur transport semantics.

Use RPC when:
- the caller expects a result
- the caller needs success/failure handling
- the caller needs request correlation by ID

Use events or streams when:
- the sender is broadcasting state changes
- listeners do not return direct results
- the flow is one-way and observational

If a boundary needs request/response semantics, do not hide it behind an event bus.

## 6. Keep Runtime Boundaries Honest

Avoid naming that hides the real transport path.

For example:
- a background-to-desktop client should say `rpc`, `bridge`, or `host`, not pretend to be the desktop runtime itself
- a broker in Electron main should be named as a bridge or host layer, not as if it were the business logic owner

Names should describe responsibility, not aspiration.

## 7. Registry Domains Should Stay Explicit

Package registry domains are not interchangeable buckets.

Each domain exists because it has a distinct runtime meaning:
- windows
- widgets
- tools
- components
- features
- processes
- pipelines
- renderers
- registries

When introducing a new domain, define:
- who owns it
- which runtime loads it
- what contract it must satisfy
- how it is invoked or rendered

## 8. Mirror State Deliberately

When desktop UI shows background state, treat that as mirrored state.

The mirrored representation should be:
- clearly derived from a transport channel
- disposable and reconstructable
- separate from the original runtime owner

This keeps the UI honest about what it owns and what it merely presents.

## 9. Prefer Narrow Contracts Over Broad Reach

A runtime should not reach into another runtime's implementation details directly.

Prefer:
- schema-backed messages
- dedicated bridge functions
- typed API surfaces
- stable engine methods

Avoid:
- ad hoc global access across runtime boundaries
- stringly-typed payloads scattered across many files
- transport details leaking into UI components or package modules

## 10. Experimental Does Not Mean Structureless

ACE is intentionally experimental, but experimentation should still preserve architectural discipline.

The codebase should stay easy to refactor by keeping:
- names honest
- boundaries explicit
- contracts typed
- ownership clear
- transport semantics unambiguous
