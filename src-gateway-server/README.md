# ACE DeepAgent Gateway Server

## Related Runtime Docs

Gateway-side behavior documented here is consumed by app-side context composition and parser ingestion. See:

- `docs/GATEWAY_CONTEXT_MECHANISM.md`

DeepAgents-backed gateway sidecar that runs the ACE agent runtime across OpenAI, Google Gemini, and Anthropic models.

## Overview

The gateway server is a Python-based sidecar that:
- Exposes a unified HTTP API for the ACE app
- Hosts the DeepAgents runtime that executes agent runs
- Resolves provider/model bindings through LangChain integrations
- Streams plain text output that remains compatible with ACE block parsing on the client

## Architecture

```
┌──────────────────────────┐
│   ACE Frontend (Tauri)   │  TypeScript/React
│   aiGatewayEngine        │
└───────────┬──────────────┘
            │ HTTP (localhost:8888)
            │
┌───────────▼──────────────┐
│  DeepAgent Gateway       │  Python/FastAPI
│  ├─ /health            │
│  ├─ /models/{sdk}      │
│  ├─ /test/{sdk}        │
│  └─ /chat/{sdk}        │
└───────────┬──────────────┘
            │
    ┌───────▼──────────────────┐
    │   DeepAgent Harness App  │
    └───────┬──────────────────┘
      │
    ┌───────┼───────┐
    │       │       │
    ▼       ▼       ▼
 OpenAI  Google Anthropic
 LC      LC      LC
```

## Installation

### Prerequisites
- Python 3.9+
- pip

### Setup

1. Install dependencies:
```bash
cd src-gateway-server
pip install -r requirements.txt
```

2. The runtime uses DeepAgents + LangChain provider packages listed in `requirements.txt`.

## Running the Server

### Development

```bash
cd src-gateway-server
python main.py
```

Server will start on `http://localhost:8888`

### With Logging

```bash
cd src-gateway-server
python -m uvicorn main:create_app --host 127.0.0.1 --port 8888 --reload
```

## API Reference

### Health Check

```bash
GET http://localhost:8888/health

# Response
{
  "ok": true,
  "gateway_contract_version": "2.0.0",
  "loaded_adapters": ["openai", "google"],
  "error_message": null
}
```

### Fetch Available Models

```bash
GET http://localhost:8888/models/{sdk}

# Headers
Authorization: Bearer <API_KEY>

# Path Parameters
sdk: "openai" | "google" | "anthropic"

# Response
{
  "ok": true,
  "models": [
    {
      "id": "gpt-4",
      "name": "GPT-4",
      "context_window": 8192,
      "capabilities": ["text", "tools"]
    },
    ...
  ],
  "error_message": null
}
```

### Test Model Response

```bash
POST http://localhost:8888/test/{sdk}

# Headers
Authorization: Bearer <API_KEY>
Content-Type: application/json

# Path Parameters
sdk: "openai" | "google" | "anthropic"

# Body
{
  "model": "gpt-4",
  "prompt": "Say hello"
}

# Response
{
  "ok": true,
  "response": "Hello! How can I help you today?",
  "latency_ms": 1234,
  "status_code": 200,
  "error_message": null
}
```

## Supported Providers

### OpenAI
- **API Key**: Get from https://platform.openai.com/account/api-keys
- **Runtime Binding**: `langchain_openai.ChatOpenAI`

### Google Gemini
- **API Key**: Get from https://makersuite.google.com/app/apikey
- **Runtime Binding**: `langchain_google_genai.ChatGoogleGenerativeAI`

### Anthropic Claude
- **API Key**: Get from https://console.anthropic.com/
- **Runtime Binding**: `langchain_anthropic.ChatAnthropic`

## Project Structure

```
src-gateway-server/
├── __init__.py           # Package root
├── main.py              # Server entry point
├── requirements.txt     # Python dependencies
│
├── models/              # Data Transfer Objects (DTOs)
│   └── __init__.py      # AIModel, ModelsResponse, TestResponseResult, HealthResponse
│
├── core/                # DeepAgents orchestration
│   ├── __init__.py
│   ├── gateway.py       # GatewayFacade compatibility wrapper
│   ├── deepagent_runtime.py # DeepAgents runtime execution
│   └── model_registry.py# Provider/model binding resolver
│
├── routes/              # HTTP API endpoints
│   ├── __init__.py
│   └── api.py           # FastAPI route handlers
│
├── config/              # Configuration (future)
├── runtime/             # Process lifecycle (future)
└── README.md            # This file
```

## Design Patterns

### Facade Pattern
`GatewayFacade` provides a unified interface:
- Preserves the old HTTP contract while routing work into DeepAgents
- Manages provider credential registration
- Normalizes errors and health responses

### DeepAgents Runtime
The server creates a DeepAgents-based run per request:
- Resolve provider + model through `ModelRegistry`
- Build a ReAct-capable graph app
- Run or stream the graph response back to the ACE client

## Error Handling

All endpoints return a consistent error format:

```json
{
  "ok": false,
  "error_message": "Detailed error description",
  "response": null,  // for test_response
  "models": []       // for models
}
```

Common error cases:
- **401 Unauthorized**: Missing or invalid API key in Authorization header
- **400 Bad Request**: Unsupported SDK or missing required fields
- **500 Internal Error**: Gateway not initialized or unexpected exception

## Integration with ACE Frontend

The frontend (`aiGatewayEngine.ts`) communicates with this server:

```typescript
// Fetch models
const response = await fetch('http://localhost:8888/models/openai', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

// Test response
const result = await fetch('http://localhost:8888/test/openai', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ model: 'gpt-4', prompt: 'hello' })
});
```

## Development

### Running Tests

```bash
cd src-gateway-server
pytest __tests__/
```

### Code Quality

```bash
# Format
black .

# Lint
flake8 .
```

## Future Enhancements

- [ ] Stream responses for long completions
- [ ] Request/response logging and analytics
- [ ] Rate limiting per SDK
- [ ] Configurable retry logic
- [ ] Custom provider support via plugins
- [ ] Response caching
- [ ] Cost tracking per provider
