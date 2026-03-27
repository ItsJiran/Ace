# ACE SDK Gateway Server

## Current Canonical Runtime

Use this file for sidecar-specific details. For the integrated app-side mechanism (composed prompt context, parser `context` blocks, and context-engine summary policy), refer to:

- `docs/GATEWAY_CONTEXT_MECHANISM.md`

This document describes the Python sidecar that provides multi-provider AI connectivity to the ACE assistant. It covers the full lifecycle from process startup to in-app auto-discovery and the HTTP contract between the sidecar and `aiGatewayEngine`.

---

## 1. Purpose & Role

ACE communicates with AI providers (OpenAI, Google, Anthropic) through a **dedicated Python sidecar** rather than making inline HTTP calls from the TypeScript renderer process. The sidecar is a separate OS process that runs alongside the Tauri app.

### Why a sidecar?

1. **SDK isolation** — Each provider ships a first-class Python SDK. Embedding those inside the renderer would require bundling large JS ports or native Node modules inside a sandboxed Tauri webview, which is fragile and hard to update.
2. **Credential safety** — API keys are passed as short-lived Bearer tokens over localhost on every request. They are never baked into the sidecar process environment at startup.
3. **Provider-agnostic routing** — The sidecar's `GatewayFacade` exposes a single, uniform HTTP API over all providers. The TypeScript layer never speaks to OpenAI/Google/Anthropic directly.
4. **Independent lifecycle** — The sidecar can be restarted, upgraded, or swapped without touching the main Tauri app. Future versions may ship it as a managed Tauri sidecar binary.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Tauri App (renderer / TypeScript)                      │
│                                                         │
│   aiGatewayEngine ──HTTP──► src-gateway-server          │
│                                                         │
└─────────────────────────────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  FastAPI + Uvicorn         │
              │  (src-gateway-server/)     │
              │                           │
              │  main.py ──────────────── │ ◄─ port scan 8888-8930
              │     └─ GatewayFacade      │
              │          ├─ OpenAIAdapter │ ──► api.openai.com
              │          ├─ GoogleAdapter │ ──► generativelanguage.googleapis.com
              │          └─ AnthropicAdapter ► api.anthropic.com
              └───────────────────────────┘
```

### Key source files

| File | Role |
|---|---|
| `src-gateway-server/main.py` | Uvicorn bootstrap, port auto-redirect, FastAPI app factory |
| `src-gateway-server/core/gateway.py` | `GatewayFacade` — adapter registry, load/unload lifecycle |
| `src-gateway-server/adapters/base_adapter.py` | `BaseProviderAdapter` — interface contract all adapters must implement |
| `src-gateway-server/adapters/{openai,google,anthropic}_adapter.py` | Concrete adapters per provider |
| `src-gateway-server/models/` | Shared DTO dataclasses (`HealthResponse`, `ModelsResponse`, `TestResponseResult`, `AIModel`) |
| `src-gateway-server/routes/api.py` | FastAPI route handlers (`/health`, `/models/{sdk}`, `/test/{sdk}`) |
| `src/services/aiGatewayEngine.ts` | TypeScript engine — health check, radar scan, config persistence, session management |
| `src/schemas/ai_gateway.ts` | Zod schemas + TypeScript types for all gateway DTOs |

---

## 3. HTTP API Contract

All endpoints are served at `http://127.0.0.1:<port>`. No path prefix.

### `GET /health`

Public — no authentication required.

**Response (success):**
```json
{
  "ok": true,
  "gateway_name": "ace-sdk-gateway-server",
  "gateway_contract_version": "1.0.0",
  "base_url": "http://127.0.0.1:8891",
  "port": 8891,
  "loaded_adapters": ["openai"]
}
```

**Response (gateway not initialized):**
```json
{
  "ok": false,
  "error_message": "Gateway not initialized"
}
```

The TypeScript engine verifies **both** `ok === true` AND `gateway_name === "ace-sdk-gateway-server"`. A health endpoint that returns `200 OK` but whose `gateway_name` does not match is treated as a foreign server and is rejected.

---

### `GET /models/{sdk}`

Requires Bearer token in `Authorization` header.

```
Authorization: Bearer sk-proj-...
```

**Path params:** `sdk` — one of `"openai"`, `"google"`, `"anthropic"`.

**Response (success):**
```json
{
  "ok": true,
  "sdk": "openai",
  "models": [
    { "id": "gpt-4o", "name": "GPT-4o", "description": "...", "context_window": 128000 }
  ]
}
```

Loading a new API key triggers `GatewayFacade.load_adapter(sdk, api_key)`, replacing any previously loaded adapter for that SDK.

---

### `POST /test/{sdk}`

Requires Bearer token. Sends a short probe prompt to the provider.

```
Authorization: Bearer sk-proj-...
```

**Path params:** `sdk`, **Query params:** `model` (model ID string).

**Response (success):**
```json
{
  "ok": true,
  "sdk": "openai",
  "model": "gpt-4o",
  "response": "Hello! I'm working correctly.",
  "latency_ms": 832
}
```

---

## 4. Health Verifier Protocol

The `aiGatewayEngine` health check is strict by design. The checks performed in `probeSidecar()`:

1. HTTP `GET /health` must return `200 OK`.
2. Response JSON must have `"ok": true`.
3. Response JSON must have `"gateway_name": "ace-sdk-gateway-server"` — exact string match.

This prevents the engine from accidentally treating any other local HTTP server on port 8888 as the ACE gateway. The `gateway_contract_version` field is logged for diagnostic purposes but not gated in v1.

The `base_url` returned by the health endpoint is authoritative. After a successful health check, the engine updates `this.gateway_server_url` to the verifier's own `base_url`. This ensures that even if the engine picked the server up via a radar scan on a mid-range port, subsequent requests use the canonical URL the server reports.

---

## 5. Port Management

The sidecar always tries to bind `127.0.0.1:8888` first. If the port is occupied it scans forward to `8930`.

```python
def is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False
```

`RUNTIME_HOST` and `RUNTIME_PORT` module-level globals track the actual bound values. They are passed to `api.init_gateway(...)` at startup so the `/health` endpoint can include the correct `base_url` and `port` in its response.

---

## 6. CORS Policy

```python
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:[0-9]+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

The regex accepts all `http://localhost:*` and `http://127.0.0.1:*` origins, covering any Vite dev server port and any Tauri webview origin. Wildcard strings in `allow_origins` are not valid in FastAPI's CORS implementation — the regex form is the correct approach.

---

## 7. App-Side Discovery (aiGatewayEngine)

The TypeScript engine follows a two-step auto-discovery sequence at boot:

### Step 1 — Default port health check
```typescript
const healthCheck = await this.healthCheckSidecar();
// Tries http://127.0.0.1:8888/health with a 1500 ms timeout
```

### Step 2 — Radar scan fallback
If step 1 fails (connection refused, timeout, or verifier mismatch):

```typescript
if (!healthCheck.ok) {
    const radar = await this.radarScanPorts(8888, 8930);
    if (radar.active_base_url) {
        this.gateway_server_url = radar.active_base_url;
    }
}
```

`radarScanPorts` probes every port in the range concurrently and returns the first verifying URL. Boot does **not** block or hard-fail if the sidecar is absent — it logs a warning and allows the rest of the app to continue. AI features become unavailable until the sidecar is started.

### `ensureGatewayServerUrl()` (on-demand)
Higher-level methods (e.g., `fetchModels`, `testResponse`) call this before making any request. It re-runs the health check → radar fallback sequence and resolves the live URL, allowing late-bind scenarios where the sidecar starts after the app.

---

## 8. RAM Integration

Gateway state is published to two RAM keys in `storageEngine`:

### `system:ai_gateway_config`
Persisted config loaded from `gateway.json` in Tauri AppConfig scope. Updated every time the user saves settings.

```typescript
type AIGatewayConfig = {
    version: number;
    active_sdk: SDKProvider | null;
    active_model: string | null;
    sdks: {
        openai?:    { api_key: string; models: AIGatewayModel[] };
        google?:    { api_key: string; models: AIGatewayModel[] };
        anthropic?: { api_key: string; models: AIGatewayModel[] };
    };
};
```

### `system:ai_gateway_runtime`
Live connection state. Updated after every health check or radar scan. Never written to disk.

```typescript
type AIGatewaySidecarHealthResult = {
    ok: boolean;
    base_url: string;
    status_code: number | null;
    latency_ms: number;
    gateway_name?: string;
    gateway_contract_version?: string;
    error_message?: string;
};
```

---

## 9. Config Persistence Rules

`gateway.json` is the durable config file. Key rules enforced in `aiGatewayEngine`:

1. **`ensureFile` default is `{ sdks: {} }`** — an empty map, not a map pre-populated with blank SDK entries. Pre-populating caused Zod to fail on `api_key: z.string().min(0)` for missing nested objects.
2. **`api_key: z.string().min(0)`** — empty string is valid. Providers without a configured key will have `api_key: ""` until the user sets one.
3. **Parse failure is non-destructive** — if Zod fails to parse the file, the engine keeps in-RAM defaults and logs a warning. It does **not** overwrite `gateway.json` with blank defaults. This prevents a corrupt or newer-format config file from being silently erased on downgrade.

---

## 10. Setup & Running

### One-time setup
```bash
npm run setup:gateway
# Equivalent to:
# python3 -m venv src-gateway-server/.venv
# src-gateway-server/.venv/bin/pip install -r src-gateway-server/requirements.txt
```

### Development — gateway only
```bash
npm run dev:gateway
# Runs: src-gateway-server/.venv/bin/python src-gateway-server/main.py
```

### Development — app + gateway together
```bash
npm run dev:with-gateway
# Starts gateway in background, then starts Vite dev server
# Gateway is killed automatically when Vite exits
```

The virtual environment lives at `src-gateway-server/.venv/` and is listed in `.gitignore`.

---

## 11. Adapter Pattern

All provider integrations extend `BaseProviderAdapter` from `adapters/base_adapter.py`:

```python
class BaseProviderAdapter(ABC):
    provider_id: str = ""
    provider_name: str = ""

    def __init__(self, api_key: str): ...

    @abstractmethod
    async def fetch_models(self) -> ModelsResponse: ...

    @abstractmethod
    async def test_response(self, model: str, prompt: str) -> TestResponseResult: ...

    def validate_api_key(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 0)
```

`GatewayFacade` holds a `Dict[str, BaseProviderAdapter]` registry keyed by `sdk` string. An adapter is lazy-loaded on the first request that supplies a Bearer token. Subsequent requests for the same SDK reuse the loaded adapter. `load_adapter(sdk, api_key)` replaces the existing entry if called again, enabling live key rotation without restarting the server.

---

## 12. Future Directions

- **Streaming relay** — The `/test/{sdk}` endpoint currently returns a complete response. Streaming SSE relay to allow real-time token delivery to the TypeScript `aiParser` is planned.
- **Fallback provider chain** — If the primary SDK fails mid-request, automatically retry on a secondary SDK.
- **Managed Tauri sidecar** — Package the Python sidecar as a Tauri sidecar binary so it can be launched and monitored by the Tauri runtime directly, eliminating the manual `npm run dev:gateway` step.
- **Session-gated routing** — Route each `AISession` to a specific adapter, supporting multi-provider sessions within one chat window.
- **Rate limiting & backpressure** — Per-SDK request queuing to avoid provider-side rate limit errors during burst usage.

---

## Sync Update (2026-03-27)

Latest runtime synchronization applied:

- AI parser now handles split-tag boundaries with a sliding-window carryover approach (e.g. lone `<` and `</` are buffered, not emitted as prose).
- Parser token tracing now captures raw HTTP chunk input, incoming carryover, output text preview, and carryover output.
- Stream/runtime memory now persists parser token traces per chunk for monitor consumption (`parser_token_traces`, `parser_token_trace_count`).
- AI Session Monitor now supports nested response debugging:
  - grouped by prompt turn
  - grouped by response attempt inside each prompt turn
  - token trace export buttons for full JSON and output-only payload
- Tool execution contract now supports nested payload for discriminated schemas:
  - `{"action":"execute", ..., "payload": { "action": "list_directory", "path": "~/" } }`
  - prevents `No matching discriminator for field action` collisions between block action and tool schema action.

Documentation note:
- Response debugging should be analyzed per prompt turn and per attempt, not as one flat stream.
- Auto-loop continuations belong to the same prompt turn unless a new user prompt starts a new turn.

## Sync Update 2026-03-28

Status sync for current architecture and runtime progress:
- Parser block communication is standardized on BaseBlock with payload_raw + payload_json.
- Built-in block outputs (paragraph, event, directive) now follow the same BaseBlock payload contract.
- Typed payload reader helper added in parser schema: getBlockPayloadAs<T>().
- Parser-owned payload typing pattern started with presentation parser exports (PresentationPayload and getPresentationPayload).
- Presentation flow is now explicit: AI emits presentation target (package/component + memory uid), renderer resolves registry entry and passes memory envelope to component.
- Presentation block validation hardened: component_slug is required and memory_uid is preferred (memory_key remains temporary legacy fallback).
- Context memory envelope normalization is centralized in AIContextMemoryEngine to avoid tool-only coupling.
- Gateway continuation contract uses memory pointers for rendering instead of injecting raw tool payloads into prose.
