from __future__ import annotations

import time
from typing import Any

import httpx

from memsy._http import DEFAULT_MAX_RETRIES, DEFAULT_RETRY_BACKOFF, HttpCoreMixin
from memsy.control_resources.billing import BillingResource
from memsy.control_resources.events import EventsResource
from memsy.control_resources.interest import InterestResource
from memsy.control_resources.keys import KeysResource
from memsy.control_resources.usage import UsageResource
from memsy.exceptions import MemsyAPIError, MemsyConnectionError
from memsy.models import HealthResponse, MeResponse, RateLimitInfo, UsageInfo


class MemsyControlClient(HttpCoreMixin):
    """
    Synchronous client for the Memsy control-plane API (api/).

    Handles account management, billing, API key lifecycle, usage reporting,
    and event browsing. Separate from ``MemsyClient`` because the control-plane
    is a distinct service with its own base URL.

    Usage::

        control = MemsyControlClient(
            base_url="https://api.memsy.io/api",
            api_key="msy_...",
        )

        me = control.me()
        events = control.events.list(limit=20)

        # Admin-only (returns AuthorizationError for non-admin API keys)
        summary = control.usage.summary()
        invoices = control.billing.invoices()
        key = control.keys.create("ci-key", scopes=["read"])

    Sub-resource accessors::

        control.usage       — UsageResource
        control.billing     — BillingResource
        control.keys        — KeysResource
        control.events      — EventsResource
        control.interest    — InterestResource
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_backoff: float = DEFAULT_RETRY_BACKOFF,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._max_retries = max_retries
        self._retry_backoff = retry_backoff
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=timeout,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        self.usage = UsageResource(self)
        self.billing = BillingResource(self)
        self.keys = KeysResource(self)
        self.events = EventsResource(self)
        self.interest = InterestResource(self)

    def __enter__(self) -> MemsyControlClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        self._client.close()

    def _request(
        self, method: str, path: str, **kwargs: Any
    ) -> tuple[Any, UsageInfo | None, RateLimitInfo | None]:
        """Make HTTP request with retry logic for 429s."""
        for attempt in range(self._max_retries + 1):
            try:
                response = self._client.request(method, path, **kwargs)
            except httpx.ConnectError as e:
                raise MemsyConnectionError(
                    f"Could not connect to Memsy control-plane at {self._base_url}: {e}"
                ) from e
            except httpx.TimeoutException as e:
                raise MemsyConnectionError(f"Request to Memsy control-plane timed out: {e}") from e

            if response.status_code == 429 and attempt < self._max_retries:
                retry_after = response.headers.get("Retry-After")
                wait_time = (
                    float(retry_after) if retry_after else self._retry_backoff * (2**attempt)
                )
                time.sleep(wait_time)
                continue

            usage, rate_limit = self._parse_response_headers(response)

            if not response.is_success:
                raise self._classify_error(response)

            if response.status_code == 204 or not response.content:
                return None, usage, rate_limit

            return response.json(), usage, rate_limit

        raise MemsyAPIError("Max retries exceeded", status_code=429, detail="")

    def me(self) -> MeResponse:
        """Return identity information for the authenticated caller."""
        data, _, _ = self._request("GET", "/me")
        return MeResponse.from_dict(data)

    def health(self) -> HealthResponse:
        """Check if the Memsy control-plane is healthy."""
        data, _, _ = self._request("GET", "/health")
        return HealthResponse.from_dict(data)
