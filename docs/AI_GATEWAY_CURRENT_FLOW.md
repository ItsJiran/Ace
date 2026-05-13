# AI Gateway Current Flow

Dokumen ini menjelaskan alur AI gateway yang aktif saat ini setelah migrasi ke DeepAgent harness.

## Tujuan Arsitektur

Frontend tidak lagi menjadi pemilik utama planning, context, working memory, atau prompt orchestration. Frontend hanya:

- menyimpan konfigurasi provider/model
- mengirim request ke gateway
- menerima stream text + metadata
- memantulkan snapshot runtime backend ke state observability lokal

Backend Python gateway menjadi pemilik utama untuk:

- binding provider dan model
- model listing
- agent execution via DeepAgent
- planning/context/memory snapshot assembly
- stream metadata observability

## Komponen Utama

### Frontend

- `src/services/aiGatewayEngine.ts`
  - facade utama yang dipanggil UI
- `src/services/aiGateway/healthProbe.ts`
  - menemukan sidecar aktif via `/health`
- `src/services/aiGateway/providerClient.ts`
  - call non-streaming seperti `/models/{sdk}` dan `/test/{sdk}`
- `src/services/aiGateway/sub-services/interactionParserLoop/requestOrchestration.ts`
  - mengirim request chat streaming ke gateway
- `src/services/aiGateway/sub-services/interactionParserLoop/streamProcessor.ts`
  - memecah text stream dan deepagent metadata frames
- `src/services/aiGateway/sub-services/interactionParserLoop/agentRuntimeMirror.ts`
  - mirror snapshot runtime backend ke `AISessionRuntime`
- `src/core/packages/system/components/settings/AIConnectionSettingsTab.tsx`
  - UI fetch model, pilih SDK, pilih model, simpan API key
- `src/core/packages/system-dev/components/AISessionInspector.tsx`
  - panel observability untuk request/response dan snapshot backend

### Backend

- `src-gateway-server/routes/api.py`
  - endpoint `/health`, `/models/{sdk}`, `/test/{sdk}`, `/chat/{sdk}`
- `src-gateway-server/core/gateway.py`
  - facade backend yang menghubungkan route dengan runtime
- `src-gateway-server/core/model_registry.py`
  - registrasi provider, live model listing, build chat model
- `src-gateway-server/core/deepagent_runtime.py`
  - DeepAgent harness execution dan streaming
- `src-gateway-server/core/nodes.py`
  - builder snapshot planning/context/memory/session-state untuk observability
- `src-gateway-server/prompts/agent/*.md`
  - prompt customization untuk DeepAgent runtime

## Alur 1: Health Probe

1. Frontend memanggil `HealthProbe.ensure()`.
2. `healthProbe.ts` melakukan probe ke base URL aktif.
3. Jika gagal, frontend bisa fallback ke default URL lalu radar scan port range.
4. Gateway merespons `/health` dengan identity `ace-deepagent-gateway-server`.
5. URL aktif disimpan di RAM frontend agar request berikutnya memakai sidecar yang benar.

## Alur 2: Fetch Models

1. User memilih SDK di System Settings.
2. Frontend memanggil `window.ACE.ai_gateway.fetchModels(sdk)`.
3. `AIGatewayEngine.fetchModels()` memanggil `providerClient.fetchModels()`.
4. `providerClient` mengambil API key dari config lalu request `GET /models/{sdk}` ke gateway.
5. Route `/models/{sdk}` mendaftarkan binding provider untuk proses gateway saat ini.
6. `GatewayFacade.fetch_models()` meminta daftar model ke `ModelRegistry.fetch_catalog()`.
7. `ModelRegistry.fetch_catalog()` mengambil katalog provider langsung dari endpoint/provider-native API:
  - OpenAI: HTTP `GET https://api.openai.com/v1/models`
  - Google: `google.genai.Client(...).models.list()`
  - Anthropic: `Anthropic(...).models.list()`
8. Hasil listing difilter ke model chat yang relevan untuk ACE.
9. Jika provider listing gagal, backend mengembalikan error ke frontend. Tidak ada fallback ke katalog lokal statis.
10. Frontend menerima list model dan menyimpannya ke config lokal via `AIConfigManager.updateProviderModels()`.
11. UI settings merender daftar model cached untuk SDK yang dipilih.

## Alur 3: Test Response

1. User memilih SDK + model di Settings.
2. Frontend memanggil `window.ACE.ai_gateway.testResponse(sdk, model, prompt)`.
3. Request dikirim ke `POST /test/{sdk}`.
4. Gateway membangun model chat dari `ModelRegistry.build_chat_model()`.
5. `DeepAgentRuntime.test_response()` menjalankan satu respons non-streaming.
6. Hasil dipulangkan ke UI untuk sanity check provider/model.

## Alur 4: Chat Streaming

1. Frontend mengirim request chat ke `POST /chat/{sdk}`.
2. Body utama berisi:
   - `model`
   - `prompt`
   - `session_uid`
3. Gateway route memanggil `GatewayFacade.stream_response()`.
4. `DeepAgentRuntime.stream_response()`:
   - mengambil atau membuat `GatewaySessionState`
   - membangun runtime snapshot awal dari session state
   - menyusun system prompt dari markdown prompt files + snapshot runtime
   - membangun DeepAgent harness via `create_deep_agent(...)`
   - men-stream event DeepAgent dan token text
5. Gateway mengirim dua jenis data ke frontend:
   - text output biasa
   - metadata frames prefixed dengan RS (`\u001e`) berisi `deepagent_snapshot`

## Alur 5: Runtime Snapshot dan Observability

Snapshot backend dibentuk oleh `core/nodes.py` dengan step utama:

- `intake`
- `planning`
- `context`
- `memory`
- `agent`
- `finalize`

Dari step tersebut backend membentuk:

- `active_step`
- `response_step`
- `session_state`
- `step_path`
- `state_path`
- `planning`
- `context`
- `memory`

Snapshot dikirim ke frontend dalam dua channel:

### Response headers

Untuk observability cepat di awal request, gateway menempelkan header seperti:

- `x-ace-deepagent-active-step`
- `x-ace-deepagent-response-step`
- `x-ace-deepagent-session-state`
- `x-ace-deepagent-step-path`
- `x-ace-deepagent-state-path`
- `x-ace-deepagent-planning`
- `x-ace-deepagent-context`
- `x-ace-deepagent-memory`

### Stream metadata frames

Selama stream berjalan, gateway juga menyisipkan frame JSON dengan tipe:

- `deepagent_snapshot`

Frontend parser akan memisahkan frame ini dari text biasa dan mengirimnya ke `agentRuntimeMirror.ts`.

## Alur 6: Mirror ke AISession Runtime

`agentRuntimeMirror.ts` memantulkan snapshot backend ke memory runtime frontend agar inspector dan debugging tools tetap punya observability.

Data yang dimirror mencakup:

- `session.state`
- `session.plan`
- `session.context`
- `session.working_memory`
- metadata `source`
- metadata `mirrored_at`

Frontend tidak membuat ulang planning/context/memory tersebut. Frontend hanya menampilkan hasil mirror dari backend.

## Alur 7: Memory Session Backend

`DeepAgentRuntime` mempertahankan session state per `session_uid` yang berisi minimal:

- provider
- model
- turns
- memory bank

Setelah response selesai:

1. turn user/assistant disimpan ke riwayat session
2. fact extraction dijalankan dari prompt/response
3. memory bank diperbarui
4. snapshot pada request berikutnya akan memakai riwayat dan memory bank tersebut

## Ringkasan Jalur Nyata

### Untuk fetch model

UI Settings -> `AIGatewayEngine.fetchModels()` -> `providerClient.fetchModels()` -> `/models/{sdk}` -> `GatewayFacade.fetch_models()` -> `ModelRegistry.fetch_catalog()` -> config frontend

### Untuk chat

Chat UI -> `requestOrchestration.ts` -> `/chat/{sdk}` -> `GatewayFacade.stream_response()` -> `DeepAgentRuntime.stream_response()` -> text + `deepagent_snapshot` -> `streamProcessor.ts` -> `agentRuntimeMirror.ts` -> `AISessionInspector`

## Catatan Implementasi Saat Ini

- Model listing sekarang memakai provider-facing catalog langsung. Untuk OpenAI, jalurnya adalah HTTP `GET /v1/models`, bukan katalog lokal statis.
- DeepAgent prompt customization saat ini berbasis markdown files di `src-gateway-server/prompts/agent/`.
- Frontend compatibility parser blocks masih ada untuk kompatibilitas stream lama, tetapi tidak lagi menjadi pemilik cognition.
- Inspector frontend tetap penting sebagai observability layer, tetapi sumber kebenaran runtime tetap backend gateway.
