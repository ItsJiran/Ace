# AI Gateway Current Flow

This document explains the active AI gateway workflow following the migration to the DeepAgent harness.

## Architectural Goal

The frontend is no longer the primary owner of planning, context, working memory, or prompt orchestration. The frontend is strictly responsible for:

- Storing provider/model configurations.
- Dispatching requests to the gateway.
- Consuming text streams + metadata.
- Mirroring the backend runtime snapshot into the local observability state.

The Python backend gateway serves as the primary owner for:

- Provider and model bindings.
- Model listing.
- Agent execution via DeepAgent.
- Assembly of planning, context, and memory snapshots.
- Stream metadata observability.

## Core Components

### Frontend

- `src/engines/aiGatewayEngine.ts`
  - The main facade invoked by the UI.
- `src/engines/aiGateway/healthProbe.ts`
  - Discovers the active sidecar via the `/health` endpoint.
- `src/engines/aiGateway/providerClient.ts`
  - Handles non-streaming calls such as `/models/{sdk}` and `/test/{sdk}`.
- `src/engines/aiGateway/sub-engines/interactionParserLoop/requestOrchestration.ts`
  - Dispatches streaming chat requests to the gateway.
- `src/engines/aiGateway/sub-engines/interactionParserLoop/streamProcessor.ts`
  - Parses the raw text stream and segregates DeepAgent metadata frames.
- `src/engines/aiGateway/sub-engines/interactionParserLoop/agentRuntimeMirror.ts`
  - Mirrors the backend runtime snapshot into `AISessionRuntime`.
- `src/core/packages/system/components/settings/AIConnectionSettingsTab.tsx`
  - UI for fetching models, selecting SDKs/models, and persisting API keys.
- `src/core/packages/system-dev/components/AISessionInspector.tsx`
  - Observability panel for tracking requests/responses and backend snapshots.

### Backend

- `src-gateway-server/routes/api.py`
  - Hosts the `/health`, `/models/{sdk}`, `/test/{sdk}`, and `/chat/{sdk}` endpoints.
- `src-gateway-server/core/gateway.py`
  - The backend facade bridging routes with the runtime.
- `src-gateway-server/core/model_registry.py`
  - Manages provider registrations, live model listings, and chat model construction.
- `src-gateway-server/core/deepagent_runtime.py`
  - Handles DeepAgent harness execution and streaming mechanics.
- `src-gateway-server/core/nodes.py`
  - Assembles planning/context/memory/session-state snapshots for observability.
- `src-gateway-server/prompts/agent/*.md`
  - Custom markdown prompt definitions for the DeepAgent runtime.

---

## Flow 1: Health Probe

1. The frontend invokes `HealthProbe.ensure()`.
2. `healthProbe.ts` performs a probe against the currently active base URL.
3. Upon failure, the frontend falls back to the default URL and initiates a radar scan across the designated port range.
4. The gateway responds to `/health` with the identity string `ace-deepagent-gateway-server`.
5. The active URL is retained in frontend RAM to ensure subsequent requests target the correct sidecar.

## Flow 2: Fetch Models

1. The user selects an SDK within the System Settings.
2. The frontend triggers `window.ACE.ai_gateway.fetchModels(sdk)`.
3. `AIGatewayEngine.fetchModels()` delegates the call to `providerClient.fetchModels()`.
4. `providerClient` extracts the API key from the local configuration and dispatches a `GET /models/{sdk}` request to the gateway.
5. The `/models/{sdk}` route registers the provider binding for the current gateway process instance.
6. `GatewayFacade.fetch_models()` requests the model list via `ModelRegistry.fetch_catalog()`.
7. `ModelRegistry.fetch_catalog()` retrieves the provider catalog directly from the provider-native endpoints:
   - OpenAI: HTTP `GET https://api.openai.com/v1/models`
   - Google: `google.genai.Client(...).models.list()`
   - Anthropic: `Anthropic(...).models.list()`
8. The raw listing is filtered down to the chat models relevant to ACE.
9. If the provider listing fails, the backend bubbles up the error to the frontend. No fallback to static local catalogs is performed.
10. The frontend receives the model list and persists it locally via `AIConfigManager.updateProviderModels()`.
11. The Settings UI renders the cached model list for the selected SDK.

## Flow 3: Test Response

1. The user selects an SDK + model configuration in Settings.
2. The frontend triggers `window.ACE.ai_gateway.testResponse(sdk, model, prompt)`.
3. The request is dispatched to `POST /test/{sdk}`.
4. The gateway constructs the chat model utilizing `ModelRegistry.build_chat_model()`.
5. `DeepAgentRuntime.test_response()` executes a single, non-streaming evaluation.
6. The resulting response is returned to the UI for provider/model sanity checks.

## Flow 4: Chat Streaming

1. The frontend dispatches a chat payload to `POST /chat/{sdk}`.
2. The main request body encapsulates:
   - `model`
   - `prompt`
   - `session_uid`
3. The gateway route hands over the execution to `GatewayFacade.stream_response()`.
4. `DeepAgentRuntime.stream_response()` orchestrates the following:
   - Retrieves or instantiates the corresponding `GatewaySessionState`.
   - Constructs an initial runtime snapshot derived from the session state.
   - Compiles the system prompt by combining markdown prompt files with the runtime snapshot.
   - Instantiates the DeepAgent harness via `create_deep_agent(...)`.
   - Streams both DeepAgent operational events and raw text tokens.
5. The gateway transmits two distinct data types to the frontend:
   - Standard raw text output.
   - Metadata frames prefixed with the Record Separator (RS) character (`\u001e`) containing the `deepagent_snapshot`.

## Flow 5: Runtime Snapshot and Observability

Backend snapshots are constructed sequentially by `core/nodes.py` across the following major steps:

- `intake`
- `planning`
- `context`
- `memory`
- `agent`
- `finalize`

From these execution nodes, the backend generates a snapshot payload consisting of:

- `active_step`
- `response_step`
- `session_state`
- `step_path`
- `state_path`
- `planning`
- `context`
- `memory`

This snapshot data is dispatched to the frontend through two separate channels:

### 1. Response Headers
For immediate, low-latency observability at the start of a request, the gateway embeds snapshots into the following HTTP response headers:
- `x-ace-deepagent-active-step`
- `x-ace-deepagent-response-step`
- `x-ace-deepagent-session-state`
- `x-ace-deepagent-step-path`
- `x-ace-deepagent-state-path`
- `x-ace-deepagent-planning`
- `x-ace-deepagent-context`
- `x-ace-deepagent-memory`

### 2. Stream Metadata Frames
As the stream progresses, the gateway injects JSON frames with the following type discriminator:
- `deepagent_snapshot`

The frontend stream parser intercepts these frames, segregates them from the standard text payload, and routes them directly to `agentRuntimeMirror.ts`.

## Flow 6: Mirroring to AISession Runtime

`agentRuntimeMirror.ts` pipes the backend snapshot directly into the frontend runtime memory to ensure inspector and debugging tools maintain accurate observability.

The mirrored dataset includes:
- `session.state`
- `session.plan`
- `session.context`
- `session.working_memory`
- Metadata attributes: `source` and `mirrored_at`

The frontend does *not* re-compute or independently evaluate the planning, context, or memory states; it serves exclusively as a presentation surface for the mirrored backend state.

## Flow 7: Backend Session Memory

`DeepAgentRuntime` retains session state in memory mapped per `session_uid`, tracking a minimum baseline of:
- `provider`
- `model`
- `turns` (interaction history)
- `memory bank`

Upon completion of a streaming response loop:
1. The active user/assistant conversation turn is committed to the session history.
2. Fact extraction processes are triggered across the prompt/response exchange.
3. The internal memory bank is updated.
4. Subsequent requests matching the `session_uid` automatically utilize the updated history and memory bank within their runtime snapshots.

---

## High-Level Execution Paths

### Model Fetch Path
`Settings UI` $\rightarrow$ `AIGatewayEngine.fetchModels()` $\rightarrow$ `providerClient.fetchModels()` $\rightarrow$ `GET /models/{sdk}` $\rightarrow$ `GatewayFacade.fetch_models()` $\rightarrow$ `ModelRegistry.fetch_catalog()` $\rightarrow$ `Frontend Local Config`

### Chat Streaming Path
`Chat UI` $\rightarrow$ `requestOrchestration.ts` $\rightarrow` `POST /chat/{sdk}` $\rightarrow$ `GatewayFacade.stream_response()` $\rightarrow$ `DeepAgentRuntime.stream_response()` $\rightarrow$ `Text + deepagent_snapshot (RS-prefixed)` $\rightarrow$ `streamProcessor.ts` $\rightarrow$ `agentRuntimeMirror.ts` $\rightarrow$ `AISessionInspector UI`

---

## Current Implementation Notes

- **Live Catalogs:** Model listing now exclusively targets provider-facing live APIs (e.g., HTTP `GET /v1/models` for OpenAI) instead of utilizing local static catalogs.
- **Prompt Isolation:** DeepAgent prompt customizations are localized as clean markdown structures within `src-gateway-server/prompts/agent/`.
- **Legacy Compatibility:** Frontend compatibility parser blocks remain in place to elegantly handle legacy stream structures, but they no longer retain cognitive ownership.
- **Backend as Source of Truth:** The frontend inspector panel remains critical as an observability layer, but the absolute source of truth for runtime computation is strictly bounded to the backend gateway.