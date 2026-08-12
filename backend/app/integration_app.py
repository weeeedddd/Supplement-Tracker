"""Minimal production entry point for CORELINE's optional integrations.

The offline-first client does not need a server for profile, nutrition,
training, or supplement tracking.  This app deliberately exposes only the
bounded AI and nearby-store routes plus a health endpoint.  The legacy server
in ``app.main`` remains available for local archaeology, but is not the public
deployment target.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .api_v1 import router as api_v1_router
from .integrations import integration_status
from .security import RequestBodyLimitMiddleware, parse_cors_origins


def _bounded_request_bytes() -> int:
    try:
        configured = int(os.environ.get("INTEGRATION_MAX_REQUEST_BYTES", "32768"))
    except ValueError:
        configured = 32768
    return max(8192, min(65536, configured))


app = FastAPI(
    title="CORELINE Integration API",
    version="1.0.0",
    description=(
        "Optional, server-side provider boundary for CORELINE. "
        "Local tracking never depends on this service."
    ),
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    RequestBodyLimitMiddleware,
    paths={
        "/api/v1/plan/draft",
        "/api/v1/assistant/respond",
        "/api/v1/stores/nearby",
    },
    max_bytes=_bounded_request_bytes(),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(os.environ.get("CORS_ORIGINS")),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    )
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=()"
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.get("/api/health")
async def health() -> dict:
    return {
        "ok": True,
        "service": "coreline-integrations",
        "version": app.version,
        "integrations": integration_status(),
    }


@app.get("/api/health/ready")
async def readiness() -> dict:
    """Readiness for the stateless integration boundary.

    Provider availability is reported separately and may legitimately be off;
    a deployment without keys must stay ready so the client can fall back
    honestly instead of entering a restart loop.
    """
    return {"ok": True, "service": "coreline-integrations", "ready": True}


app.include_router(api_v1_router)
