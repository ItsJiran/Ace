# ACE AI Gateway Server

## Related Runtime Docs

Gateway-side behavior documented here is consumed by app-side context composition and parser ingestion. See:

- `docs/GATEWAY_CONTEXT_MECHANISM.md`

Multi-provider LLM gateway sidecar that manages connectivity to OpenAI, Google Gemini, and Anthropic Claude APIs.

## Overview

The gateway server is a Python-based sidecar that:
- Exposes a unified HTTP API for all LLM providers
- Manages API key credential security
- Normalizes provider responses to a common contract
- Handles timeouts and error cases gracefully

## Architecture

```
┌──────────────────────────┐
│   ACE Frontend (Tauri)   │  TypeScript/React
│   aiGatewayEngine        │
└───────────┬──────────────┘
            │ HTTP (localhost:8888)
            │
┌───────────▼──────────────┐
│  AI Gateway Server       │  Python/FastAPI
│  ├─ /health            │
│  ├─ /models/{sdk}      │
│  └─ /test/{sdk}        │
└───────────┬──────────────┘
            │
    ┌───────┼───────┐
    │       │       │
    ▼       ▼       ▼
 OpenAI  Google Anthropic
 API     API    API
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

2. (Optional) Install provider SDKs if not already installed:
```bash
pip install openai google-generativeai anthropic
```

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
  "gateway_contract_version": "1.0.0",
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
- **Models**: GPT-4, GPT-3.5-turbo, and others
- **Adapter**: `OpenAIAdapter`

### Google Gemini
- **API Key**: Get from https://makersuite.google.com/app/apikey
- **Models**: Gemini Pro, Gemini Pro Vision
- **Adapter**: `GoogleAdapter`

### Anthropic Claude
- **API Key**: Get from https://console.anthropic.com/
- **Models**: Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku, Claude 2.1, Claude 2
- **Adapter**: `AnthropicAdapter`

## Project Structure

```
src-gateway-server/
├── __init__.py           # Package root
├── main.py              # Server entry point
├── requirements.txt     # Python dependencies
│
├── adapters/            # Provider-specific adapters
│   ├── __init__.py
│   ├── base_adapter.py  # Abstract base class
│   ├── openai_adapter.py
│   ├── google_adapter.py
│   └── anthropic_adapter.py
│
├── models/              # Data Transfer Objects (DTOs)
│   └── __init__.py      # AIModel, ModelsResponse, TestResponseResult, HealthResponse
│
├── core/                # Gateway orchestration
│   ├── __init__.py
│   └── gateway.py       # GatewayFacade - main router
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

### Adapter Pattern
All providers implement the `BaseProviderAdapter` interface:
- `fetch_models() -> ModelsResponse`
- `test_response(model, prompt) -> TestResponseResult`
- `validate_api_key() -> bool`

This allows new providers to be added by implementing a single interface.

### Facade Pattern
`GatewayFacade` provides a unified interface:
- Routes requests to the correct adapter
- Manages adapter lifecycle
- Normalizes errors

### Async/Await
All I/O operations are async using `aiohttp` and `asyncio`:
- Non-blocking HTTP calls to providers
- Handles timeouts gracefully (9 second default)

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
