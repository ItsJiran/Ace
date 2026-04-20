"""Gateway server - main entry point.

Runs the AI Gateway sidecar server that hosts the LangGraph runtime.
Listens on http://localhost:8888 by default.
"""

import uvicorn
import socket
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.gateway import GatewayFacade
from routes import api

RUNTIME_HOST = "127.0.0.1"
RUNTIME_PORT = 8888


# Global gateway instance
gateway_instance: GatewayFacade = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage gateway lifecycle - startup and shutdown.
    
    Args:
        app: FastAPI application instance
    """
    global gateway_instance
    # Startup
    print("[Gateway] Initializing gateway facade...")
    gateway_instance = GatewayFacade()
    api.init_gateway(gateway_instance, RUNTIME_HOST, RUNTIME_PORT)
    print(f"[Gateway] Ready. Supported providers: {', '.join(GatewayFacade.SUPPORTED_SDKS)}")
    
    yield
    
    # Shutdown
    print("[Gateway] Shutting down gateway...")
    # No cleanup needed yet


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.
    
    Returns:
        Configured FastAPI application
    """
    app = FastAPI(
        title="ACE LangGraph Gateway Server",
        description="LangGraph runtime gateway for ACE Assistant",
        version="2.0.0",
        lifespan=lifespan,
    )

    # CORS middleware for local development
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:[0-9]+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routes
    app.include_router(api.router)

    return app


def main():
    """Main entry point for the gateway server."""
    global RUNTIME_HOST
    global RUNTIME_PORT

    preferred_host = "127.0.0.1"
    preferred_port = 8888
    max_scan_port = 8930

    def is_port_available(host: str, port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return True
            except OSError:
                return False

    selected_port = preferred_port
    if not is_port_available(preferred_host, preferred_port):
        for candidate in range(preferred_port + 1, max_scan_port + 1):
            if is_port_available(preferred_host, candidate):
                selected_port = candidate
                break

    RUNTIME_HOST = preferred_host
    RUNTIME_PORT = selected_port

    app = create_app()
    
    # Run the server
    print("=" * 60)
    print("Starting ACE LangGraph Gateway Server")
    print("=" * 60)
    print(f"Listening on: http://{preferred_host}:{selected_port}")
    if selected_port != preferred_port:
        print(f"[Gateway] Port {preferred_port} in use, auto-redirected to {selected_port}")
    print("Supported providers: openai, google, anthropic")
    print("=" * 60)
    
    uvicorn.run(
        app,
        host=preferred_host,
        port=selected_port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
