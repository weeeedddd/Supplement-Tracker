"""Versioned public integration routes for the offline-first client."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .integration_models import (
    AssistantReplyEnvelope,
    AssistantRespondRequest,
    NearbyStoresEnvelope,
    NearbyStoresRequest,
    PlanDraftEnvelope,
    PlanDraftRequest,
)
from .integrations import (
    IntegrationUnavailable,
    InvalidProviderResponse,
    LocationNotFound,
    ProviderFailure,
    find_nearby_stores,
    generate_assistant_reply,
    generate_plan_draft,
    integration_status,
)
from .security import InMemoryRateLimiter

router = APIRouter(prefix="/api/v1", tags=["integrations-v1"])


def _bounded_limit(name: str, default: int, maximum: int) -> int:
    try:
        value = int((os.environ.get(name) or str(default)).strip())
    except ValueError:
        value = default
    return max(1, min(maximum, value))


_plan_limiter = InMemoryRateLimiter(
    limit=_bounded_limit("AI_PLAN_RATE_LIMIT_PER_MINUTE", 6, 60),
    window_seconds=60,
)
_stores_limiter = InMemoryRateLimiter(
    limit=_bounded_limit("STORE_SEARCH_RATE_LIMIT_PER_MINUTE", 20, 120),
    window_seconds=60,
)
_assistant_limiter = InMemoryRateLimiter(
    limit=_bounded_limit("AI_ASSISTANT_RATE_LIMIT_PER_MINUTE", 12, 60),
    window_seconds=60,
)


def _rate_limit(limiter: InMemoryRateLimiter, route_name: str):
    async def enforce(request: Request, response: Response) -> None:
        # Do not trust a client-supplied forwarding header here. Deployments
        # behind a proxy should normalize the direct client address there.
        client_host = request.client.host if request.client else "unknown"
        snapshot = limiter.check(f"{route_name}:{client_host}")
        response.headers["X-RateLimit-Limit"] = str(snapshot.limit)
        response.headers["X-RateLimit-Remaining"] = str(snapshot.remaining)
        if not snapshot.allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Try again later.",
                headers={
                    "Retry-After": str(snapshot.retry_after),
                    "X-RateLimit-Limit": str(snapshot.limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

    return enforce


_limit_plan = _rate_limit(_plan_limiter, "plan-draft")
_limit_stores = _rate_limit(_stores_limiter, "stores-nearby")
_limit_assistant = _rate_limit(_assistant_limiter, "assistant-respond")


def reset_rate_limiters() -> None:
    """Reset process-local counters for deterministic isolated tests."""
    _plan_limiter.clear()
    _stores_limiter.clear()
    _assistant_limiter.clear()


@router.get("/integrations/status")
async def get_integration_status() -> dict:
    return integration_status()


@router.post("/plan/draft", response_model=PlanDraftEnvelope)
async def create_plan_draft(
    body: PlanDraftRequest,
    _: None = Depends(_limit_plan),
) -> PlanDraftEnvelope:
    try:
        draft, model = await generate_plan_draft(body)
    except IntegrationUnavailable as exc:
        raise HTTPException(
            503, "AI plan service is not configured on this server."
        ) from exc
    except ProviderFailure as exc:
        raise HTTPException(503, "AI plan service is temporarily unavailable.") from exc
    except InvalidProviderResponse as exc:
        raise HTTPException(
            502, "AI plan service returned an unusable response."
        ) from exc
    return PlanDraftEnvelope(
        provider="openai",
        model=model,
        generated_at=datetime.now(timezone.utc).isoformat(),
        provider_storage_requested=False,
        draft=draft,
        safety_disclaimer=(
            "General wellness draft only—not medical advice. For symptoms, medication, injuries, "
            "or individual clinical needs, consult a qualified professional."
        ),
    )


@router.post("/assistant/respond", response_model=AssistantReplyEnvelope)
async def assistant_respond(
    body: AssistantRespondRequest,
    _: None = Depends(_limit_assistant),
) -> AssistantReplyEnvelope:
    try:
        reply, model = await generate_assistant_reply(body)
    except IntegrationUnavailable as exc:
        raise HTTPException(
            503, "AI assistant is not configured on this server."
        ) from exc
    except ProviderFailure as exc:
        raise HTTPException(503, "AI assistant is temporarily unavailable.") from exc
    except InvalidProviderResponse as exc:
        raise HTTPException(502, "AI assistant returned an unusable response.") from exc
    return AssistantReplyEnvelope(
        answer=reply.answer,
        safety_notes=reply.safety_notes,
        escalation=reply.escalation,
        provider="openai",
        model=model,
        generated_at=datetime.now(timezone.utc).isoformat(),
        provider_storage_requested=False,
    )


@router.post("/stores/nearby", response_model=NearbyStoresEnvelope)
async def nearby_stores(
    body: NearbyStoresRequest,
    _: None = Depends(_limit_stores),
) -> NearbyStoresEnvelope:
    try:
        result = await find_nearby_stores(body)
    except IntegrationUnavailable as exc:
        raise HTTPException(
            503, "Nearby store search is not configured on this server."
        ) from exc
    except LocationNotFound as exc:
        raise HTTPException(
            422, "The location could not be resolved in the requested country."
        ) from exc
    except ProviderFailure as exc:
        raise HTTPException(
            503, "Nearby store search is temporarily unavailable."
        ) from exc
    except InvalidProviderResponse as exc:
        raise HTTPException(
            502, "The store provider returned an unusable response."
        ) from exc
    return NearbyStoresEnvelope.model_validate(result)
