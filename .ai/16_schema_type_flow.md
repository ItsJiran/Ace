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
