"""Small, explicit security controls used by the public integration API.

The rate limiter is intentionally process-local.  It is useful as a first
cost-control boundary for a single instance, but production deployments with
multiple workers must replace it with a shared store (for example Redis) and
apply an equivalent limit at the reverse proxy.
"""

from __future__ import annotations

import math
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from urllib.parse import urlsplit

from fastapi.responses import JSONResponse

DEFAULT_CORS_ORIGINS = (
    "https://weeeedddd.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


def parse_cors_origins(raw: str | None) -> list[str]:
    """Return exact HTTP(S) origins and reject wildcard/malformed entries."""
    values = (
        DEFAULT_CORS_ORIGINS
        if raw is None
        else tuple(
            value.strip().rstrip("/") for value in raw.split(",") if value.strip()
        )
    )
    origins: list[str] = []
    for origin in values:
        if origin == "*":
            raise ValueError("CORS_ORIGINS must contain exact origins, never '*'")
        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(f"Invalid CORS origin: {origin!r}")
        normalized = f"{parsed.scheme}://{parsed.netloc}"
        if normalized not in origins:
            origins.append(normalized)
    return origins


class RequestBodyLimitMiddleware:
    """Buffer and cap JSON bodies for selected expensive anonymous routes."""

    def __init__(self, app, *, paths: set[str], max_bytes: int) -> None:
        self.app = app
        self.paths = frozenset(paths)
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http" or scope.get("path") not in self.paths:
            await self.app(scope, receive, send)
            return

        content_length = next(
            (
                value
                for key, value in scope.get("headers", [])
                if key.lower() == b"content-length"
            ),
            None,
        )
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                await self._reject(
                    scope, receive, send, status_code=400, detail="Invalid request."
                )
                return

        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message.get("type") == "http.disconnect":
                await self._reject(
                    scope, receive, send, status_code=400, detail="Request interrupted."
                )
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max_bytes:
                await self._reject(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        delivered = False

        async def replay():
            nonlocal delivered
            if delivered:
                return {"type": "http.disconnect"}
            delivered = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(
        scope,
        receive,
        send,
        *,
        status_code: int = 413,
        detail: str = "Request body is too large.",
    ) -> None:
        response = JSONResponse({"detail": detail}, status_code=status_code)
        await response(scope, receive, send)


@dataclass(frozen=True)
class RateLimitSnapshot:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


class InMemoryRateLimiter:
    """Fixed-window anonymous limiter keyed by direct client IP and route."""

    def __init__(self, *, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> RateLimitSnapshot:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                retry_after = max(1, math.ceil(self.window_seconds - (now - events[0])))
                return RateLimitSnapshot(False, self.limit, 0, retry_after)
            events.append(now)
            remaining = self.limit - len(events)

            # Avoid retaining an unbounded number of one-off client keys.
            if len(self._events) > 10_000:
                stale = [
                    event_key
                    for event_key, values in self._events.items()
                    if not values or values[-1] <= cutoff
                ]
                for event_key in stale:
                    self._events.pop(event_key, None)
            return RateLimitSnapshot(True, self.limit, remaining, self.window_seconds)

    def clear(self) -> None:
        """Reset process-local state (primarily useful for deterministic tests)."""
        with self._lock:
            self._events.clear()
