# Schema Type Flow (Cross-Package Boundary V1)

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in docs/GATEWAY_CONTEXT_MECHANISM.md.

This document explains how type and schema contracts flow across core and external packages without compile-time coupling.

## Goals

1. Keep cross-package communication runtime-safe.
2. Avoid TypeScript import coupling between package boundaries.
3. Make RegistryEngine the single schema resolver.
4. Keep memory payloads traceable and re-validatable.

## Core Rule

Cross-package boundaries must communicate with runtime schema objects, not TypeScript-only interfaces.

TypeScript types are still useful inside each package, but boundary validation is schema-ref driven.

## End-to-End Flow

1. Package author exports domain entry with schema metadata.
2. RegistryEngine normalizes and stores schema metadata.
3. Runtime writer sends payload with schema reference metadata.
4. AIContextMemoryEngine resolves schema_ref via RegistryEngine.
5. AIContextMemoryEngine validates payload at write-time and records validation status.
6. Consumer reads memory envelope and can resolve schema_ref again for strict revalidation.
7. Consumer maps payload into package-owned typed reader helper (for example getPresentationPayload()).

## Registry Metadata Contract (V1)

Per domain entry, runtime metadata should include:

1. schema_ref
2. schema_version
3. schema_kind (json_schema preferred)
4. payload_schema
5. input_schema (optional)
6. output_schema (optional)

Recommended schema_ref pattern:

- <package_ref>:<domain>:<slug>:payload
- Example: itsjiran/ace-system:parsers:presentation:payload

## Memory Envelope Contract (V1)

In addition to payload and source metadata, envelope should carry:

1. schema_ref
2. schema_version
3. schema_kind
4. validation_status (validated | skipped | failed)
5. validated_at

Pointer policy:

1. memory_uid is preferred for runtime references.
2. memory_key is temporary legacy fallback.

## Validation Lifecycle

Write-time (mandatory):

1. Resolve schema_ref in RegistryEngine.
2. Verify schema_version compatibility.
3. Validate payload against payload_schema when available.
4. Persist envelope with validation metadata.

Read-time (optional strict mode):

1. Resolve schema_ref again from RegistryEngine.
2. Revalidate payload for strict consumer paths.
3. Reject or downgrade invalid payloads in sensitive paths.

Current strict retrieval hook:

1. context:retrieve supports `strict_schema_validation: boolean`.
2. When enabled, non-validated payload envelopes are rejected.
3. Current transition policy defaults to strict retrieval when flag is omitted.
4. Legacy key prefixes are temporarily allowed in non-strict mode for backward compatibility.

## Consumer Pattern

Consumer should not hardcode union types for every block.

Use:

1. BaseBlock + payload_json as generic transport.
2. getBlockPayloadAs<T>() for typed payload extraction.
3. parser/domain-owned helpers (for example getPresentationPayload()) as local adapters.

## Parser Runtime Naming (V1)

To reduce ambiguity between stream token input and canonical runtime identity:

1. `parsed_tag` = exact token parsed from stream block tags.
2. `block_slug` = canonical runtime identity for action/status classification.
3. `slug` = canonical parser registry identity.

Contract guidance:

1. Parser lifecycle + interrupt observability channels should emit `parsed_tag`.
2. Session summaries and handler status fields should emit `block_slug`.
3. New boundary payloads should avoid legacy naming (`tag`, `block_tag`, `tag_name`).

## External Bundle Guidance

1. External bundles may author schemas with any internal tool.
2. Boundary contract should expose JSON Schema-compatible runtime objects.
3. Avoid hard dependency on global validator objects such as window.zod.
4. Let host runtime own final validation.

## Compatibility Rules

1. Keep backward compatibility within same major schema_version.
2. Add migration adapters when major schema changes are introduced.
3. Mark failed validation explicitly in envelope metadata.
4. Do not silently coerce unknown boundary payloads in strict paths.

## Why We Implement This

This architecture is intentionally chosen for long-term package ecosystem stability.

1. Runtime safety over compile-time illusion
	- TypeScript type sharing across package boundaries is not a runtime guarantee.
	- Runtime schema metadata gives real validation at the boundary where failures actually happen.

2. Lower cross-package coupling
	- Consumers resolve schema through RegistryEngine using schema_ref.
	- Packages do not need deep cross-imports for every payload contract.
	- This keeps core and external packages independently evolvable.

3. Better failure handling and debuggability
	- Validation status is persisted (`validated`, `skipped`, `failed`) with timestamps.
	- Retrieval strict mode can block unsafe payloads before they affect UI or loop logic.
	- Metrics key (`system:ai_context_memory:validation_metrics`) provides quick health visibility.

4. Safer external package onboarding
	- External bundles only need to expose runtime schema objects.
	- Host runtime remains the final validator and policy gate.
	- This reduces risk from malformed or drifting payload contracts.

5. Controlled migration path
	- `memory_uid` is now preferred while legacy `memory_key` is still tolerated temporarily.
	- Strict-by-default retrieval with legacy fallback allows gradual rollout without hard break.

6. Future versioning readiness
	- schema_ref + schema_version allows explicit compatibility checks.
	- Version adapters can be introduced without redesigning transport contracts.

## Current Implementation Status

Implemented:

1. Registry schema metadata normalization in RegistryEngine.
2. schema_ref resolver via RegistryEngine.getSchemaByRef().
3. Write-time schema-aware metadata stamping in AIContextMemoryEngine.
4. Validation status recorded in memory envelope.
5. Typed payload reader helper getBlockPayloadAs<T>().
6. Strict schema retrieval option in context retrieval route.
7. Validation metrics RAM key: system:ai_context_memory:validation_metrics.

Pending hardening:

1. Shared strict JSON Schema validator for all boundary paths.
2. Version migration adapter layer.
3. Full integration tests for schema_ref miss/version mismatch paths.
