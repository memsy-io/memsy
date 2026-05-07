from __future__ import annotations

import asyncio
from typing import Any

import httpx

from memsy._http import DEFAULT_MAX_RETRIES, DEFAULT_RETRY_BACKOFF, HttpCoreMixin
from memsy.control_resources.billing import AsyncBillingResource
from memsy.control_resources.events import AsyncEventsResource
from memsy.control_resources.interest import AsyncInterestResource
from memsy.control_resources.keys import AsyncKeysResource
from memsy.control_resources.usage import AsyncUsageResource
from memsy.exceptions import MemsyAPIError, MemsyConnectionError
from memsy.models import HealthResponse, MeResponse, RateLimitInfo, UsageInfo


class AsyncMemsyControlClient(HttpCoreMixin):
    """
    Asynchronous client for the Memsy control-plane API (api/).

    Handles account management, billing, API key lifecycle, usage reporting,
    and event browsing. Separate from ``AsyncMemsyClient`` because the control-plane
    is a distinct service with its own base URL.

    Usage::

        import os

        async with AsyncMemsyControlClient(
            base_url=os.environ["MEMSY_CONTROL_URL"],
            api_key=os.environ["MEMSY_API_KEY"],
        ) as control:
            me = await control.me()
            events = await control.events.list(limit=20)

    Sub-resource accessors::

        control.usage       — AsyncUsageResource
        control.billing     — AsyncBillingResource
        control.keys        — AsyncKeysResource
        control.events      — AsyncEventsResource
        control.interest    — AsyncInterestResource
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
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        self.usage = AsyncUsageResource(self)
        self.billing = AsyncBillingResource(self)
        self.keys = AsyncKeysResource(self)
        self.events = AsyncEventsResource(self)
        self.interest = AsyncInterestResource(self)

    async def __aenter__(self) -> AsyncMemsyControlClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        await self._client.aclose()

    async def _request(
        self, method: str, path: str, **kwargs: Any
    ) -> tuple[Any, UsageInfo | None, RateLimitInfo | None]:
        """Make HTTP request with retry logic for 429s."""
        for attempt in range(self._max_retries + 1):
            try:
                response = await self._client.request(method, path, **kwargs)
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
                await asyncio.sleep(wait_time)
                continue

            usage, rate_limit = self._parse_response_headers(response)

            if not response.is_success:
                raise self._classify_error(response)

            if response.status_code == 204 or not response.content:
                return None, usage, rate_limit

            return response.json(), usage, rate_limit

        raise MemsyAPIError("Max retries exceeded", status_code=429, detail="")

    async def me(self) -> MeResponse:
        """Return identity information for the authenticated caller."""
        data, _, _ = await self._request("GET", "/me")
        return MeResponse.from_dict(data)

    async def health(self) -> HealthResponse:
        """Check if the Memsy control-plane is healthy."""
        data, _, _ = await self._request("GET", "/health")
        return HealthResponse.from_dict(data)
