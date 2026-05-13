"""HTTP route handlers for the DeepAgents gateway server."""

from typing import Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from core.gateway import GatewayFacade
from models import HealthResponse


router = APIRouter()

# Global gateway instance
gateway: Optional[GatewayFacade] = None
runtime_host: str = "127.0.0.1"
runtime_port: int = 8888


def init_gateway(gw: GatewayFacade, host: str = "127.0.0.1", port: int = 8888) -> None:
    """Initialize the gateway facade for routes.
    
    Args:
        gw: GatewayFacade instance
    """
    global gateway
    global runtime_host
    global runtime_port
    gateway = gw
    runtime_host = host
    runtime_port = port


async def extract_bearer_token(request: Request) -> str:
    """Extract API key from Bearer token in Authorization header.
    
    Args:
        request: FastAPI request object
        
    Returns:
        API key string or empty string if not found
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]  # Remove "Bearer " prefix
    return ""


@router.get("/health")
async def health(request: Request) -> dict:
    """Health check endpoint.
    
    Returns:
        Dict with gateway status and registered providers
    """
    if gateway is None:
        return HealthResponse(
            ok=False,
            error_message="Gateway not initialized"
        ).to_dict()

    base_url = f"http://{runtime_host}:{runtime_port}"

    return HealthResponse(
        ok=True,
        gateway_name="ace-deepagent-gateway-server",
        gateway_contract_version="2.0.0",
        base_url=base_url,
        port=runtime_port,
        loaded_adapters=gateway.get_loaded_adapters(),
    ).to_dict()


@router.get("/models/{sdk}")
async def fetch_models(sdk: str, request: Request) -> JSONResponse:
    """Fetch the curated provider model catalog.
    
    Expects Bearer token with API key in Authorization header.
    
    Args:
        sdk: Provider ID (kept as `sdk` in the path for compatibility)
        request: FastAPI request to extract API key
        
    Returns:
        ModelsResponse as JSON
    """
    if gateway is None:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error_message": "Gateway not initialized"
            }
        )

    api_key = await extract_bearer_token(request)
    if not api_key:
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "error_message": "Missing or invalid Authorization header. Use: Authorization: Bearer <api_key>"
            }
        )

    # Register provider credentials for this runtime process.
    if not gateway.load_adapter(sdk, api_key):
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error_message": f"Unsupported SDK: {sdk}. Supported: openai, google, anthropic"
            }
        )

    result = await gateway.fetch_models(sdk)
    return JSONResponse(content=result.to_dict())


@router.post("/test/{sdk}")
async def test_response(sdk: str, request: Request) -> JSONResponse:
    """Test a completion by running the DeepAgents runtime once.
    
    Expects Bearer token with API key in Authorization header.
    Body should be JSON with "model" and "prompt" fields.
    
    Args:
        sdk: Provider ID (kept as `sdk` in the path for compatibility)
        request: FastAPI request to extract API key and body
        
    Returns:
        TestResponseResult as JSON
    """
    if gateway is None:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error_message": "Gateway not initialized"
            }
        )

    api_key = await extract_bearer_token(request)
    if not api_key:
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "error_message": "Missing or invalid Authorization header. Use: Authorization: Bearer <api_key>"
            }
        )

    # Register provider credentials for this runtime process.
    if not gateway.load_adapter(sdk, api_key):
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error_message": f"Unsupported SDK: {sdk}. Supported: openai, google, anthropic"
            }
        )

    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error_message": f"Invalid JSON body: {str(e)}"
            }
        )

    model = body.get("model", "")
    prompt = body.get("prompt", "")
    session_uid = body.get("session_uid") or None

    if not model:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error_message": "Missing required field: model"
            }
        )

    result = await gateway.test_response(sdk, model, prompt, session_uid)
    return JSONResponse(content=result.to_dict())


@router.post("/chat/{sdk}")
async def chat_stream(sdk: str, request: Request) -> StreamingResponse:
    """Stream a DeepAgents-backed chat run token-by-token.

    Expects Bearer token in Authorization header.
    Body: JSON with "model" and "prompt" fields.
    Returns a plain text chunked streaming response.

    Args:
        sdk: Provider ID (kept as `sdk` in the path for compatibility)
        request: FastAPI request

    Returns:
        StreamingResponse with raw text tokens
    """
    if gateway is None:
        async def error_gen():
            yield "[error: Gateway not initialized]"
        return StreamingResponse(error_gen(), media_type="text/plain", status_code=500)

    api_key = await extract_bearer_token(request)
    if not api_key:
        async def error_gen():
            yield "[error: Missing or invalid Authorization header. Use: Authorization: Bearer <api_key>]"
        return StreamingResponse(error_gen(), media_type="text/plain", status_code=401)

    if not gateway.load_adapter(sdk, api_key):
        async def error_gen():
            yield f"[error: Unsupported SDK: {sdk}. Supported: openai, google, anthropic]"
        return StreamingResponse(error_gen(), media_type="text/plain", status_code=400)

    try:
        body = await request.json()
    except Exception as e:
        async def error_gen():
            yield f"[error: Invalid JSON body: {str(e)}]"
        return StreamingResponse(error_gen(), media_type="text/plain", status_code=400)

    model = body.get("model", "")
    prompt = body.get("prompt", "")
    session_uid = body.get("session_uid") or None

    if not model:
        async def error_gen():
            yield "[error: Missing required field: model]"
        return StreamingResponse(error_gen(), media_type="text/plain", status_code=400)

    async def generate():
        async for chunk in gateway.stream_response(sdk, model, prompt, session_uid):
            yield chunk

    response_headers = gateway.build_stream_headers(sdk, model, prompt, session_uid)
    return StreamingResponse(generate(), media_type="text/plain", headers=response_headers)
