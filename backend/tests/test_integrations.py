from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app import integrations
from app.api_v1 import reset_rate_limiters
from app.integration_app import app
from app.integration_models import (
    AssistantRespondRequest,
    NearbyStoresRequest,
    PlanDraftRequest,
)
from app.security import InMemoryRateLimiter, parse_cors_origins

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_integration_environment(monkeypatch: pytest.MonkeyPatch):
    reset_rate_limiters()
    for name in (
        "PUBLIC_INTEGRATIONS_ENABLED",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "GOOGLE_MAPS_API_KEY",
        "GOOGLE_GEOCODING_API_KEY",
        "GOOGLE_PLACES_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("PUBLIC_INTEGRATIONS_ENABLED", "true")


def plan_request_payload() -> dict:
    return {
        "consent": {"share_profile_and_lifestyle": True},
        "response_language": "de",
        "age": 30,
        "height_cm": 180.0,
        "weight_kg": 80.0,
        "goal": "general_fitness",
        "intensity": "medium",
        "training_experience": "intermediate",
        "available_days_per_week": 3,
        "session_minutes": 60,
        "equipment": ["dumbbells", "pull-up bar"],
        "dietary_preferences": ["omnivore"],
        "lifestyle": {
            "daily_routine": "Desk work on weekdays with a daily walk and evening training window.",
            "work_pattern": "mostly_seated",
            "activity_level": "moderate",
            "average_sleep_hours": 7.5,
            "sleep_quality": "mixed",
            "meal_pattern": "Three meals, usually cooked at home, with lunch prepared in advance.",
            "cooking_access": "full",
            "stress_level": 3,
            "movement_constraints": "",
        },
    }


def valid_plan_draft() -> dict:
    training_days = []
    for day_number, label in enumerate(
        ("Full body A", "Full body B", "Full body C"), start=1
    ):
        training_days.append(
            {
                "day_number": day_number,
                "label": label,
                "focus": "Recoverable full-body strength practice",
                "duration_minutes": 60,
                "exercises": [
                    {
                        "name": "Goblet squat",
                        "sets": 3,
                        "reps_or_duration": "8-10 controlled repetitions",
                        "effort_cue": "Finish each set with two comfortable repetitions in reserve.",
                        "equipment": "dumbbell",
                    }
                ],
            }
        )
    return {
        "title": "Three-day balanced foundation",
        "summary": "A conservative starting structure that fits the stated schedule and equipment.",
        "training_days": training_days,
        "nutrition": {
            "calorie_target_kcal": 2400,
            "protein_target_g": 150,
            "carbohydrate_target_g": 270,
            "fat_target_g": 80,
            "sugar_guidance": "Prefer minimally processed meals and treat added sugar as an occasional choice.",
            "meal_principles": [
                "Include a practical protein source at each main meal.",
                "Use repeatable meals that fit the available cooking time.",
            ],
        },
        "recovery": {
            "sleep_target_hours": 8.0,
            "actions": [
                "Keep wake time reasonably consistent across the week.",
                "Use a short wind-down period before bed.",
            ],
        },
        "safety_notes": [
            "Stop an exercise if it causes sharp or worsening pain.",
            "Adjust volume downward when recovery is consistently poor.",
        ],
        "assumptions": ["Training days can be separated by at least one easier day."],
    }


def store_request_payload() -> dict:
    return {
        "location_consent": True,
        "country": "DE",
        "budget": 65.0,
        "currency": "EUR",
        "address": "Alexanderplatz 1, Berlin",
        "radius_meters": 5000,
        "max_results": 5,
        "language_code": "de",
    }


def assistant_request_payload() -> dict:
    return {
        "consent_to_remote_ai": True,
        "question": "Which protein-rich breakfast could replace yogurt?",
        "response_language": "de",
        "profile_context": {
            "age": 30,
            "goal": "general_fitness",
            "activity_level": "moderate",
            "average_sleep_hours": 7.5,
            "dietary_preferences": ["vegetarian"],
            "daily_routine_summary": "Desk work, evening training, breakfast prepared at home.",
        },
        "plan_context": {
            "plan_title": "Three-day balanced foundation",
            "training_summary": "Three full-body sessions each week.",
            "nutrition_summary": "Repeatable meals with a protein source at each main meal.",
            "calorie_target_kcal": 2400,
            "protein_target_g": 150,
        },
    }


def test_status_is_honest_when_integrations_are_unconfigured():
    response = client.get("/api/v1/integrations/status")
    assert response.status_code == 200
    assert response.json()["ai"] == {
        "available": False,
        "provider": "openai",
        "mode": "unavailable",
        "reason": "server_not_configured",
    }
    assert response.json()["stores"]["available"] is False


def test_public_integration_app_is_minimal_and_reports_capabilities():
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "service": "coreline-integrations",
        "version": "1.0.0",
        "integrations": {
            "ai": {
                "available": False,
                "provider": "openai",
                "mode": "unavailable",
                "reason": "server_not_configured",
            },
            "stores": {
                "available": False,
                "provider": "google_maps",
                "coordinate_search_available": False,
                "address_search_available": False,
                "reason": "server_not_configured",
            },
        },
    }
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert client.post("/api/auth/register", json={}).status_code == 404
    assert client.post("/api/scans", json={}).status_code == 404
    assert client.get("/docs").status_code == 404


def test_health_and_readiness_are_not_cached_and_have_security_headers():
    for path in ("/api/health", "/api/health/ready"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["permissions-policy"] == (
            "camera=(), microphone=(), geolocation=()"
        )


def test_provider_response_decoder_rejects_oversized_or_non_object_json(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("INTEGRATION_MAX_RESPONSE_BYTES", str(64 * 1024))
    with pytest.raises(integrations.InvalidProviderResponse):
        integrations._decode_provider_json(b"x" * (64 * 1024 + 1))
    with pytest.raises(integrations.InvalidProviderResponse):
        integrations._decode_provider_json(b"[]")
    assert integrations._decode_provider_json(b'{"ok":true}') == {"ok": True}


def test_cost_bearing_routes_are_default_deny_even_when_keys_exist(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.delenv("PUBLIC_INTEGRATIONS_ENABLED", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-a-secret")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "maps-test-key")

    status = client.get("/api/v1/integrations/status")
    assert status.status_code == 200
    assert status.json()["ai"]["available"] is False
    assert status.json()["ai"]["reason"] == "public_access_disabled"
    assert status.json()["stores"]["available"] is False
    assert status.json()["stores"]["reason"] == "public_access_disabled"

    response = client.post("/api/v1/assistant/respond", json=assistant_request_payload())
    assert response.status_code == 503
    assert response.json() == {
        "detail": "Public provider access is disabled on this server."
    }


def test_plan_endpoint_rejects_under_18_and_location_fields():
    under_age = plan_request_payload()
    under_age["age"] = 17
    assert client.post("/api/v1/plan/draft", json=under_age).status_code == 422

    with_address = plan_request_payload()
    with_address["address"] = "This must never enter the AI schema"
    assert client.post("/api/v1/plan/draft", json=with_address).status_code == 422


def test_plan_endpoint_returns_503_instead_of_fake_ai():
    response = client.post("/api/v1/plan/draft", json=plan_request_payload())
    assert response.status_code == 503
    assert response.json() == {
        "detail": "AI plan service is not configured on this server."
    }


def test_openai_responses_request_is_bounded_structured_and_not_stored(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-a-secret")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    calls: list[dict] = []

    async def fake_request(method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return {
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "content": [
                        {"type": "output_text", "text": json.dumps(valid_plan_draft())}
                    ],
                }
            ],
        }

    monkeypatch.setattr(integrations, "_request_json", fake_request)
    request = PlanDraftRequest.model_validate(plan_request_payload())
    draft, model = asyncio.run(integrations.generate_plan_draft(request))

    assert model == "test-model"
    assert draft.nutrition.calorie_target_kcal == 2400
    assert len(calls) == 1
    call = calls[0]
    assert call["method"] == "POST"
    assert call["url"] == integrations.OPENAI_RESPONSES_URL
    provider_payload = call["json_body"]
    assert provider_payload["store"] is False
    assert 800 <= provider_payload["max_output_tokens"] <= 2400
    assert provider_payload["text"]["format"]["type"] == "json_schema"
    assert provider_payload["text"]["format"]["strict"] is True
    assert provider_payload["text"]["format"]["schema"]["additionalProperties"] is False
    serialized_input = provider_payload["input"][0]["content"][0]["text"]
    assert '"address"' not in serialized_input
    assert '"location"' not in serialized_input

    endpoint_response = client.post("/api/v1/plan/draft", json=plan_request_payload())
    assert endpoint_response.status_code == 200
    assert endpoint_response.json()["provider"] == "openai"
    assert endpoint_response.json()["provider_storage_requested"] is False


def test_server_rejects_a_structured_ai_plan_with_supplement_dosing(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-a-secret")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    unsafe = valid_plan_draft()
    unsafe["safety_notes"][0] = "Take 5 g creatine every day."

    async def fake_request(*args, **kwargs):
        return {"status": "completed", "output_text": json.dumps(unsafe)}

    monkeypatch.setattr(integrations, "_request_json", fake_request)
    request = PlanDraftRequest.model_validate(plan_request_payload())
    with pytest.raises(integrations.InvalidProviderResponse):
        asyncio.run(integrations.generate_plan_draft(request))


def test_server_rejects_excessive_generated_session_volume(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-a-secret")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    unsafe = valid_plan_draft()
    base_exercise = unsafe["training_days"][0]["exercises"][0]
    unsafe["training_days"][0]["exercises"] = [
        {**base_exercise, "name": f"Exercise {index}", "sets": 6}
        for index in range(1, 6)
    ]

    async def fake_request(*args, **kwargs):
        return {"status": "completed", "output_text": json.dumps(unsafe)}

    monkeypatch.setattr(integrations, "_request_json", fake_request)
    request = PlanDraftRequest.model_validate(plan_request_payload())
    with pytest.raises(integrations.InvalidProviderResponse):
        asyncio.run(integrations.generate_plan_draft(request))


def test_assistant_requires_consent_caps_question_and_forbids_address_context():
    no_consent = assistant_request_payload()
    no_consent["consent_to_remote_ai"] = False
    assert client.post("/api/v1/assistant/respond", json=no_consent).status_code == 422

    too_long = assistant_request_payload()
    too_long["question"] = "x" * 1_001
    assert client.post("/api/v1/assistant/respond", json=too_long).status_code == 422

    with_address = assistant_request_payload()
    with_address["profile_context"]["address"] = "Must not be accepted"
    assert (
        client.post("/api/v1/assistant/respond", json=with_address).status_code == 422
    )


def test_assistant_returns_503_instead_of_a_fake_fallback():
    response = client.post(
        "/api/v1/assistant/respond", json=assistant_request_payload()
    )
    assert response.status_code == 503
    assert response.json() == {
        "detail": "AI assistant is not configured on this server."
    }


def test_assistant_uses_bounded_structured_responses_api(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-a-secret")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    calls: list[dict] = []

    async def fake_request(method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return {
            "status": "completed",
            "output_text": json.dumps(
                {
                    "answer": "Try eggs, tofu scramble, or a bean-based spread and compare portions.",
                    "safety_notes": [],
                    "escalation": "none",
                }
            ),
        }

    monkeypatch.setattr(integrations, "_request_json", fake_request)
    request = AssistantRespondRequest.model_validate(assistant_request_payload())
    reply, model = asyncio.run(integrations.generate_assistant_reply(request))

    assert model == "test-model"
    assert reply.escalation == "none"
    provider_payload = calls[0]["json_body"]
    assert calls[0]["url"] == integrations.OPENAI_RESPONSES_URL
    assert provider_payload["store"] is False
    assert 250 <= provider_payload["max_output_tokens"] <= 1_000
    assert provider_payload["text"]["format"]["strict"] is True
    assert provider_payload["text"]["format"]["schema"]["additionalProperties"] is False
    serialized_input = provider_payload["input"][0]["content"][0]["text"]
    assert '"address"' not in serialized_input
    assert "local emergency services" in provider_payload["instructions"]

    endpoint_response = client.post(
        "/api/v1/assistant/respond", json=assistant_request_payload()
    )
    assert endpoint_response.status_code == 200
    assert endpoint_response.json()["provider"] == "openai"
    assert endpoint_response.json()["provider_storage_requested"] is False


def test_assistant_rejects_missed_urgent_escalation(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-a-secret")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    payload = assistant_request_payload()
    payload["question"] = (
        "I have severe chest pain right now. What workout should I do?"
    )

    async def fake_request(*args, **kwargs):
        return {
            "status": "completed",
            "output_text": json.dumps(
                {"answer": "Rest for now.", "safety_notes": [], "escalation": "none"}
            ),
        }

    monkeypatch.setattr(integrations, "_request_json", fake_request)
    request = AssistantRespondRequest.model_validate(payload)
    with pytest.raises(integrations.InvalidProviderResponse):
        asyncio.run(integrations.generate_assistant_reply(request))


def test_store_endpoint_requires_explicit_consent_and_one_location_source():
    no_consent = store_request_payload()
    no_consent["location_consent"] = False
    assert client.post("/api/v1/stores/nearby", json=no_consent).status_code == 422

    two_sources = store_request_payload()
    two_sources["coordinates"] = {"latitude": 52.52, "longitude": 13.405}
    assert client.post("/api/v1/stores/nearby", json=two_sources).status_code == 422


def test_store_endpoint_returns_503_when_provider_is_unconfigured():
    response = client.post("/api/v1/stores/nearby", json=store_request_payload())
    assert response.status_code == 503
    assert response.json() == {
        "detail": "Nearby store search is not configured on this server."
    }


def test_google_store_search_uses_real_provider_fields_without_price_claims(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("GOOGLE_GEOCODING_API_KEY", "geo-test-key")
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "places-test-key")
    calls: list[dict] = []

    async def fake_request(method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        if url == integrations.GOOGLE_GEOCODING_URL:
            return {
                "status": "OK",
                "results": [
                    {
                        "address_components": [
                            {"short_name": "DE", "types": ["country"]}
                        ],
                        "geometry": {"location": {"lat": 52.5219, "lng": 13.4132}},
                    }
                ],
            }
        assert url == integrations.GOOGLE_NEARBY_URL
        return {
            "places": [
                {
                    "id": "real-provider-place-id",
                    "displayName": {
                        "text": "Example Supermarket",
                        "languageCode": "de",
                    },
                    "formattedAddress": "Example Street 1, 10178 Berlin",
                    "location": {"latitude": 52.5222, "longitude": 13.4140},
                    "googleMapsUri": "https://www.google.com/maps/place/?q=place_id:real-provider-place-id",
                    "primaryType": "supermarket",
                }
            ]
        }

    monkeypatch.setattr(integrations, "_request_json", fake_request)
    request = NearbyStoresRequest.model_validate(store_request_payload())
    result = asyncio.run(integrations.find_nearby_stores(request))

    assert [call["url"] for call in calls] == [
        integrations.GOOGLE_GEOCODING_URL,
        integrations.GOOGLE_NEARBY_URL,
    ]
    geocode_call, places_call = calls
    assert geocode_call["params"]["address"] == store_request_payload()["address"]
    assert "address" not in json.dumps(places_call["json_body"])
    assert "budget" not in json.dumps(places_call["json_body"])
    assert result["provider"] == "google_maps"
    assert result["results"][0]["provider_id"] == "real-provider-place-id"
    assert result["results"][0]["provider"] == "google_maps"
    assert result["budget_context"]["price_comparison_available"] is False
    assert "prices" in result["notice"].lower()
    assert "stock" in result["notice"].lower()

    endpoint_response = client.post(
        "/api/v1/stores/nearby", json=store_request_payload()
    )
    assert endpoint_response.status_code == 200
    assert endpoint_response.json()["provider"] == "google_maps"
    assert (
        endpoint_response.json()["results"][0]["provider_id"]
        == "real-provider-place-id"
    )


def test_expensive_endpoint_body_limit_rejects_oversized_payload():
    oversized = plan_request_payload()
    oversized["lifestyle"]["daily_routine"] = "x" * 40_000
    response = client.post(
        "/api/v1/plan/draft",
        json=oversized,
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 413
    assert response.json() == {"detail": "Request body is too large."}
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_never_accepts_a_wildcard_and_rate_limiter_blocks_excess():
    with pytest.raises(ValueError):
        parse_cors_origins("*")

    limiter = InMemoryRateLimiter(limit=2, window_seconds=60)
    assert limiter.check("client").allowed is True
    assert limiter.check("client").allowed is True
    blocked = limiter.check("client")
    assert blocked.allowed is False
    assert blocked.remaining == 0
    assert blocked.retry_after >= 1
