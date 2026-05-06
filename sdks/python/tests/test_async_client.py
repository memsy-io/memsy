"""Tests for the asynchronous AsyncMemsyClient."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from memsy import AsyncMemsyClient, EventPayload
from memsy.exceptions import (
    AuthenticationError,
    FeatureNotAvailable,
    MemsyConnectionError,
)


def _make_response(status_code: int, body: dict, headers: dict | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json.return_value = body
    resp.headers = headers or {}
    resp.content = b"x"  # non-empty so 204-check doesn't trigger
    return resp


@pytest.fixture
def client():
    return AsyncMemsyClient(base_url="https://test.memsy.io", api_key="test_key")


class TestAsyncMemsyClientInit:
    def test_init_defaults(self):
        c = AsyncMemsyClient(base_url="https://test.memsy.io", api_key="test_key")
        assert c._base_url == "https://test.memsy.io"
        assert c._max_retries == 3
        assert c._retry_backoff == 1.0

    def test_auth_header(self, client):
        assert client._client.headers.get("Authorization") == "Bearer test_key"

    def test_sub_resources_present(self, client):
        assert hasattr(client, "orgs")
        assert hasattr(client, "roles")
        assert hasattr(client, "teams")
        assert hasattr(client, "memories")


class TestAsyncContextManager:
    @pytest.mark.asyncio
    async def test_context_manager(self):
        async with AsyncMemsyClient(
            base_url="https://test.memsy.io", api_key="test_key"
        ) as client:
            assert client._client is not None


class TestAsyncHealth:
    @pytest.mark.asyncio
    async def test_health_success(self, client):
        resp = _make_response(200, {"status": "ok", "version": "2.1.0"})
        with patch.object(client._client, "request", new=AsyncMock(return_value=resp)):
            result = await client.health()
        assert result.status == "ok"
        assert result.version == "2.1.0"

    @pytest.mark.asyncio
    async def test_health_with_new_fields(self, client):
        resp = _make_response(
            200,
            {
                "status": "ok",
                "version": "2.1.0",
                "billing_enabled": True,
                "components": {"async_memsy": "ok"},
            },
        )
        with patch.object(client._client, "request", new=AsyncMock(return_value=resp)):
            result = await client.health()
        assert result.billing_enabled is True
        assert result.components == {"async_memsy": "ok"}


class TestAsyncIngest:
    @pytest.mark.asyncio
    async def test_ingest_success(self, client):
        resp = _make_response(200, {"event_ids": ["evt_1", "evt_2"]})
        with patch.object(client._client, "request", new=AsyncMock(return_value=resp)):
            events = [
                EventPayload(
                    actor_id="user_1",
                    session_id="s1",
                    kind="user_message",
                    content="Hello",
                )
            ]
            result = await client.ingest(events)
        assert result.event_ids == ["evt_1", "evt_2"]

    @pytest.mark.asyncio
    async def test_ingest_with_role_and_team(self, client):
        resp = _make_response(200, {"event_ids": ["evt_1"]})
        mock_request = AsyncMock(return_value=resp)
        with patch.object(client._client, "request", new=mock_request):
            events = [
                EventPayload(
                    actor_id="u1",
                    session_id="s1",
                    kind="user_message",
                    content="Hello",
                    role_id="role_eng",
                    team_id="team_platform",
                )
            ]
            await client.ingest(events)
        call_kwargs = mock_request.call_args[1]
        event_body = call_kwargs["json"]["events"][0]
        assert event_body["role_id"] == "role_eng"
        assert event_body["team_id"] == "team_platform"


class TestAsyncSearch:
    @pytest.mark.asyncio
    async def test_search_success(self, client):
        resp = _make_response(
            200,
            {"results": [{"id": "m1", "content": "dark mode", "score": 0.9, "metadata": None}]},
        )
        with patch.object(client._client, "request", new=AsyncMock(return_value=resp)):
            result = await client.search("preferences")
        assert len(result.results) == 1
        assert result.results[0].id == "m1"

    def test_search_org_id_raises_type_error(self, client):
        """org_id was removed in 0.3.0 — passing it raises TypeError."""
        with pytest.raises(TypeError):
            # asyncio.run not needed — the TypeError is raised at call time before coro is created
            import inspect

            sig = inspect.signature(client.search)
            sig.bind("query", org_id="my-org")  # type: ignore[call-arg]


class TestAsyncErrors:
    @pytest.mark.asyncio
    async def test_401_raises_authentication_error(self, client):
        resp = _make_response(401, {"detail": "Invalid API key"})
        resp.is_success = False
        with patch.object(client._client, "request", new=AsyncMock(return_value=resp)):
            with pytest.raises(AuthenticationError) as exc_info:
                await client.health()
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_403_feature_raises_feature_not_available(self, client):
        resp = _make_response(
            403,
            {
                "error": "feature_not_available",
                "detail": "Reranking not available",
                "feature": "reranking",
                "current_tier": "free",
                "upgrade_url": "https://memsy.io/upgrade",
            },
        )
        resp.is_success = False
        with patch.object(client._client, "request", new=AsyncMock(return_value=resp)):
            with pytest.raises(FeatureNotAvailable) as exc_info:
                await client.health()
        assert exc_info.value.feature == "reranking"

    @pytest.mark.asyncio
    async def test_429_retry_then_success(self, client):
        client._max_retries = 1
        client._retry_backoff = 0.0

        resp_429 = _make_response(429, {"detail": "Rate limited"}, {"Retry-After": "0"})
        resp_429.is_success = False
        resp_ok = _make_response(200, {"status": "ok"})

        call_count = 0

        async def fake_request(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return resp_429 if call_count == 1 else resp_ok

        with patch.object(client._client, "request", new=fake_request):
            result = await client.health()
        assert result.status == "ok"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_connection_error_raises_memsy_connection_error(self, client):
        with patch.object(
            client._client,
            "request",
            new=AsyncMock(side_effect=httpx.ConnectError("refused")),
        ):
            with pytest.raises(MemsyConnectionError):
                await client.health()
