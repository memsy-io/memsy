from __future__ import annotations

import time
from typing import Any

import httpx

from memsy._http import DEFAULT_MAX_RETRIES, DEFAULT_RETRY_BACKOFF, HttpCoreMixin
from memsy.exceptions import MemsyAPIError, MemsyConnectionError
from memsy.models import (
    ClearResponse,
    EventPayload,
    HealthResponse,
    IngestResponse,
    RateLimitInfo,
    SearchResponse,
    StatusResponse,
    UsageInfo,
)
from memsy.resources.memories import MemoriesResource
from memsy.resources.orgs import OrgsResource
from memsy.resources.roles import RolesResource
from memsy.resources.teams import TeamsResource


class MemsyClient(HttpCoreMixin):
    """
    Synchronous Memsy SDK client for the hot-path memory engine (memsy-core).

    Usage::

        import os

        client = MemsyClient(
            base_url=os.environ["MEMSY_BASE_URL"],
            api_key=os.environ["MEMSY_API_KEY"],
        )

        # or as a context manager
        with MemsyClient(base_url="...", api_key="***") as client:
            health = client.health()

    Sub-resource accessors::

        # Onboarding hierarchy
        client.orgs.create(org_id="my-org", name="My Org", focus="...")
        client.roles.list(org_id="my-org")
        client.teams.create(org_id="my-org", name="Engineering", focus="...")

        # Console memory browsing
        client.memories.list(kind="semantic")
        client.memories.stats()
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
        self.orgs = OrgsResource(self)
        self.roles = RolesResource(self)
        self.teams = TeamsResource(self)
        self.memories = MemoriesResource(self)

    def __enter__(self) -> MemsyClient:
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
                    f"Could not connect to Memsy at {self._base_url}: {e}"
                ) from e
            except httpx.TimeoutException as e:
                raise MemsyConnectionError(f"Request to Memsy timed out: {e}") from e

            if response.status_code == 429:
                if attempt < self._max_retries:
                    retry_after = response.headers.get("Retry-After")
                    wait_time = (
                        float(retry_after) if retry_after else self._retry_backoff * (2**attempt)
                    )
                    time.sleep(wait_time)
                    continue
                raise MemsyAPIError("Max retries exceeded", status_code=429, detail="")

            usage, rate_limit = self._parse_response_headers(response)

            if not response.is_success:
                raise self._classify_error(response)

            # 204 No Content — return None body
            if response.status_code == 204 or not response.content:
                return None, usage, rate_limit

            return response.json(), usage, rate_limit

    def ingest(self, events: list[EventPayload]) -> IngestResponse:
        """
        Ingest a batch of events.

        :param events: List of EventPayload objects to ingest.
        :returns: IngestResponse with the generated event IDs.
        """
        body = {"events": [e.to_dict() for e in events]}
        data, usage, rate_limit = self._request("POST", "/ingest", json=body)
        response = IngestResponse.from_dict(data)
        response.usage = usage
        response.rate_limit = rate_limit
        return response

    def search(
        self,
        query: str,
        *,
        actor_id: str | None = None,
        limit: int = 10,
        threshold: float = 0.3,
        include_source_events: bool = False,
    ) -> SearchResponse:
        """
        Search memories.

        :param query: Natural language query string.
        :param actor_id: Optional actor/user ID to further scope the search.
        :param limit: Maximum number of results to return (default 10).
        :param threshold: Minimum relevance score threshold (default 0.3).
        :param include_source_events: Include source events in result metadata.
        :returns: SearchResponse containing ranked memory results.
        """
        body: dict[str, Any] = {
            "query": query,
            "limit": limit,
            "threshold": threshold,
            "include_source_events": include_source_events,
        }
        if actor_id is not None:
            body["actor_id"] = actor_id
        data, usage, rate_limit = self._request("POST", "/search", json=body)
        response = SearchResponse.from_dict(data)
        response.usage = usage
        response.rate_limit = rate_limit
        return response

    def status(self, event_ids: list[str]) -> StatusResponse:
        """
        Check processing status for a set of ingested event IDs.

        :param event_ids: List of event IDs returned by a previous ingest call.
        :returns: StatusResponse with completed, failed, and pending ID lists.
        """
        data, usage, rate_limit = self._request("POST", "/status", json={"event_ids": event_ids})
        response = StatusResponse.from_dict(data)
        response.usage = usage
        response.rate_limit = rate_limit
        return response

    def health(self) -> HealthResponse:
        """
        Check if the Memsy service is healthy.

        :returns: HealthResponse with status, version, and component health.
        """
        data, usage, rate_limit = self._request("GET", "/health")
        response = HealthResponse.from_dict(data)
        response.usage = usage
        response.rate_limit = rate_limit
        return response

    def clear(self, container_tag: str) -> ClearResponse:
        """
        Clear tracking state for a container/conversation tag.

        :param container_tag: The container tag to clear.
        :returns: ClearResponse with count of deleted items.
        """
        data, usage, rate_limit = self._request("DELETE", f"/clear/{container_tag}")
        response = ClearResponse.from_dict(data)
        response.usage = usage
        response.rate_limit = rate_limit
        return response
