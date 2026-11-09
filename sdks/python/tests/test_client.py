"""Tests for the synchronous MemsyClient."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from memsy import EventPayload, MemsyClient
from memsy.exceptions import (
    AuthenticationError,
    AuthorizationError,
    FeatureNotAvailable,
    MemsyAPIError,
    MemsyConnectionError,
    UsageLimitExceeded,
)


@pytest.fixture
def client():
    """Create a test client."""
    return MemsyClient(base_url="https://test.memsy.io", api_key="test_key")


class TestMemsyClientInit:
    """Tests for client initialization."""

    def test_init_with_defaults(self):
        """Test client initializes with default values."""
        client = MemsyClient(base_url="https://test.memsy.io", api_key="test_key")
        assert client._base_url == "https://test.memsy.io"
        assert client._api_key == "test_key"
        assert client._max_retries == 3
        assert client._retry_backoff == 1.0

    def test_init_with_custom_retry_config(self):
        """Test client initializes with custom retry config."""
        client = MemsyClient(
            base_url="https://test.memsy.io",
            api_key="test_key",
            max_retries=5,
            retry_backoff=2.0,
        )
        assert client._max_retries == 5
        assert client._retry_backoff == 2.0

    def test_auth_header_format(self, client):
        """Test that Authorization header uses Bearer token format."""
        headers = client._client.headers
        assert headers.get("Authorization") == "Bearer test_key"


class TestMemsyClientMethods:
    """Tests for client methods."""

    @patch("httpx.Client.request")
    def test_health_success(self, mock_request, client):
        """Test health check returns correct response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"status": "ok", "version": "1.0.0"}
        mock_response.headers = {}
        mock_request.return_value = mock_response

        result = client.health()
        assert result.status == "ok"
        assert result.version == "1.0.0"

    @patch("httpx.Client.request")
    def test_ingest_success(self, mock_request, client):
        """Test ingest returns event IDs."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"event_ids": ["evt_1", "evt_2"]}
        mock_response.headers = {}
        mock_request.return_value = mock_response

        events = [
            EventPayload(
                actor_id="user_1",
                session_id="session_1",
                kind="user_message",
                content="Hello",
            )
        ]
        result = client.ingest(events)
        assert result.event_ids == ["evt_1", "evt_2"]

    @patch("httpx.Client.request")
    def test_ingest_with_role_and_team(self, mock_request, client):
        """Test ingest with role_id and team_id in EventPayload."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"event_ids": ["evt_1"]}
        mock_response.headers = {}
        mock_request.return_value = mock_response

        events = [
            EventPayload(
                actor_id="user_1",
                session_id="session_1",
                kind="user_message",
                content="Hello",
                role_id="role_eng",
                team_id="team_platform",
            )
        ]
        client.ingest(events)
        call_kwargs = mock_request.call_args[1]
        event_body = call_kwargs["json"]["events"][0]
        assert event_body["role_id"] == "role_eng"
        assert event_body["team_id"] == "team_platform"

    @patch("httpx.Client.request")
    def test_search_success(self, mock_request, client):
        """Test search returns results."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {
            "results": [{"id": "mem_1", "content": "test memory", "score": 0.9, "metadata": None}]
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        result = client.search("test query")
        assert len(result.results) == 1
        assert result.results[0].id == "mem_1"

    @patch("httpx.Client.request")
    def test_search_without_org_id(self, mock_request, client):
        """Test that search no longer requires org_id."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"results": []}
        mock_response.headers = {}
        mock_request.return_value = mock_response

        # Should work without org_id
        result = client.search("test query")
        assert result.results == []

        # Verify request body doesn't contain org_id
        call_kwargs = mock_request.call_args
        if call_kwargs and "json" in call_kwargs[1]:
            assert "org_id" not in call_kwargs[1]["json"]

    def test_search_with_org_id_raises_type_error(self, client):
        """Test that passing org_id to search() raises TypeError (removed in 0.3.0)."""
        with pytest.raises(TypeError):
            client.search("test query", org_id="my-org")  # type: ignore[call-arg]

    @patch("httpx.Client.request")
    def test_search_with_include_source_events(self, mock_request, client):
        """Test search with include_source_events=True passes flag in body."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"results": []}
        mock_response.headers = {}
        mock_request.return_value = mock_response

        client.search("test query", include_source_events=True)
        call_kwargs = mock_request.call_args[1]
        assert call_kwargs["json"]["include_source_events"] is True

    @staticmethod
    def _ok(mock_request):
        """Wire a mock to return an empty 200 search response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"results": []}
        mock_response.headers = {}
        mock_request.return_value = mock_response

    @patch("httpx.Client.request")
    def test_search_omits_session_filters_by_default(self, mock_request, client):
        """Omitting both filters must produce the request body callers got before
        these parameters existed — the keys ABSENT, not present-and-null. Every
        existing caller depends on this."""
        self._ok(mock_request)

        client.search("test query")

        body = mock_request.call_args[1]["json"]
        assert "session_id" not in body
        assert "exclude_session_id" not in body

    @patch("httpx.Client.request")
    def test_search_with_session_id(self, mock_request, client):
        """session_id reaches the body under its snake_case wire name."""
        self._ok(mock_request)

        client.search("test query", session_id="conv-42")

        body = mock_request.call_args[1]["json"]
        assert body["session_id"] == "conv-42"
        assert "exclude_session_id" not in body

    @patch("httpx.Client.request")
    def test_search_with_exclude_session_id(self, mock_request, client):
        """exclude_session_id reaches the body under its snake_case wire name."""
        self._ok(mock_request)

        client.search("test query", exclude_session_id="conv-42")

        body = mock_request.call_args[1]["json"]
        assert body["exclude_session_id"] == "conv-42"
        assert "session_id" not in body

    @patch("httpx.Client.request")
    def test_search_sends_both_session_filters_unvalidated(self, mock_request, client):
        """The SDK does not reject the contradictory pair — the server owns that
        rule and answers 422. Pinned so nobody 'helpfully' adds client-side
        validation that can drift from the server's."""
        self._ok(mock_request)

        client.search("test query", session_id="conv-1", exclude_session_id="conv-2")

        body = mock_request.call_args[1]["json"]
        assert body["session_id"] == "conv-1"
        assert body["exclude_session_id"] == "conv-2"

    @patch("httpx.Client.request")
    def test_search_sends_empty_session_id_verbatim(self, mock_request, client):
        """An empty string is sent as-is, matching how actor_id behaves. The
        server collapses it to "no filter", so a caller passing "" gets an
        UNSCOPED search rather than an error — documented, and pinned here so the
        behaviour is a decision rather than an accident."""
        self._ok(mock_request)

        client.search("test query", session_id="")

        body = mock_request.call_args[1]["json"]
        assert body["session_id"] == ""

    @patch("httpx.Client.request")
    def test_search_sends_empty_session_id_beside_exclude(self, mock_request, client):
        """The contradictory pair is NOT contradictory when one side is empty.

        The server trims each id and treats an empty result as unset, and it does
        that before the mutual-exclusion check — so this combination does not 422,
        it runs as a plain exclude search. A caller writing
        ``session_id=current or ""`` gets a silently different scope with a 200.
        Pinned because the docs previously claimed a flat "sending both is a 422".
        """
        self._ok(mock_request)

        client.search("test query", session_id="", exclude_session_id="conv-2")

        body = mock_request.call_args[1]["json"]
        assert body["session_id"] == ""
        assert body["exclude_session_id"] == "conv-2"

    @patch("httpx.Client.request")
    def test_search_surfaces_422_for_an_unsearchable_session_id(self, mock_request, client):
        """An id that ingest accepted can still be rejected by search.

        Ingest validates length only; search also validates the charset
        (``[A-Za-z0-9_-:.@/]``, max 256). So a session id containing a space or
        any non-ASCII character round-trips into storage and then 422s here.
        The SDK does not pre-validate — it forwards the id and surfaces the
        server's error — and this pins the shape callers have to catch.
        """
        mock_response = MagicMock()
        mock_response.status_code = 422
        mock_response.is_success = False
        mock_response.json.return_value = {
            "detail": [{"msg": "session ids may contain only letters, digits, and _ - : . @ /"}]
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(MemsyAPIError) as exc:
            client.search("test query", session_id="chat about ünicode")

        assert exc.value.status_code == 422
        # Forwarded verbatim — no client-side charset check that could drift
        # from the server's.
        assert mock_request.call_args[1]["json"]["session_id"] == "chat about ünicode"

    @patch("httpx.Client.request")
    def test_search_result_exposes_session_id(self, mock_request, client):
        """The conversation each result came from survives the round trip."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {
            "results": [
                {
                    "id": "mem_1",
                    "content": "scoped",
                    "score": 0.9,
                    "metadata": {"session_id": "conv-42"},
                },
                {"id": "mem_2", "content": "promoted", "score": 0.8, "metadata": {}},
            ]
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        result = client.search("test query")

        assert result.results[0].session_id == "conv-42"
        assert result.results[1].session_id is None

    @patch("httpx.Client.request")
    def test_health_with_components(self, mock_request, client):
        """Test health response includes new billing_enabled and components fields."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {
            "status": "ok",
            "version": "2.1.0",
            "billing_enabled": True,
            "components": {"async_memsy": "ok", "sync_memsy": "ok"},
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        result = client.health()
        assert result.billing_enabled is True
        assert result.components == {"async_memsy": "ok", "sync_memsy": "ok"}

    @patch("httpx.Client.request")
    def test_client_has_sub_resources(self, mock_request, client):
        """Test that MemsyClient exposes orgs, roles, teams, memories sub-resources."""
        assert hasattr(client, "orgs")
        assert hasattr(client, "roles")
        assert hasattr(client, "teams")
        assert hasattr(client, "memories")


class TestUsageHeaders:
    """Tests for usage header parsing."""

    @patch("httpx.Client.request")
    def test_usage_headers_parsed(self, mock_request, client):
        """Test that usage headers are parsed correctly."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"status": "ok"}
        mock_response.headers = {
            "X-Usage-ApiCalls": "100",
            "X-Usage-ApiCalls-Limit": "500000",
            "X-Plan": "pro",
        }
        mock_request.return_value = mock_response

        result = client.health()
        assert result.usage is not None
        assert result.usage.api_calls == 100
        assert result.usage.api_calls_limit == 500000
        assert result.usage.plan == "pro"

    @patch("httpx.Client.request")
    def test_rate_limit_headers_parsed(self, mock_request, client):
        """Test that rate limit headers are parsed correctly."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"status": "ok"}
        mock_response.headers = {
            "X-RateLimit-Limit": "1000",
            "X-RateLimit-Remaining": "950",
            "X-RateLimit-Reset": "1711584000",
        }
        mock_request.return_value = mock_response

        result = client.health()
        assert result.rate_limit is not None
        assert result.rate_limit.limit == 1000
        assert result.rate_limit.remaining == 950
        assert result.rate_limit.reset == 1711584000


class TestErrorHandling:
    """Tests for error handling."""

    @patch("httpx.Client.request")
    def test_401_raises_authentication_error(self, mock_request, client):
        """Test that 401 raises AuthenticationError."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.is_success = False
        mock_response.json.return_value = {"detail": "Invalid API key"}
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(AuthenticationError) as exc_info:
            client.health()
        assert exc_info.value.status_code == 401

    @patch("httpx.Client.request")
    def test_403_scope_raises_authorization_error(self, mock_request, client):
        """Test that 403 with scope error raises AuthorizationError."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "wrong_scope",
            "detail": "API key missing 'read' scope",
            "required_scope": "read",
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(AuthorizationError) as exc_info:
            client.health()
        assert exc_info.value.required_scope == "read"

    @patch("httpx.Client.request")
    def test_403_feature_raises_feature_not_available(self, mock_request, client):
        """Test that 403 with feature error raises FeatureNotAvailable."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "feature_not_available",
            "detail": "Reranking not available on free tier",
            "feature": "reranking",
            "current_tier": "free",
            "upgrade_url": "https://memsy.io/upgrade",
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(FeatureNotAvailable) as exc_info:
            client.health()
        assert exc_info.value.feature == "reranking"
        assert exc_info.value.current_tier == "free"

    @patch("httpx.Client.request")
    def test_429_usage_raises_usage_limit_exceeded(self, mock_request, client):
        """Test that 429 with quota error raises UsageLimitExceeded."""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "usage_limit_exceeded",
            "detail": "Event quota exceeded",
            "dimension": "events",
            "current": 25001,
            "limit": 25000,
            "upgrade_url": "https://memsy.io/upgrade",
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(UsageLimitExceeded) as exc_info:
            client.health()
        assert exc_info.value.dimension == "events"
        assert exc_info.value.current == 25001
        assert exc_info.value.limit == 25000

    @patch("httpx.Client.request")
    def test_connection_error(self, mock_request, client):
        """Test that connection error raises MemsyConnectionError."""
        mock_request.side_effect = httpx.ConnectError("Connection refused")

        with pytest.raises(MemsyConnectionError):
            client.health()


class TestContextManager:
    """Tests for context manager support."""

    def test_context_manager_closes_client(self):
        """Test that context manager properly closes client."""
        with MemsyClient(base_url="https://test.memsy.io", api_key="test_key") as client:
            assert client._client is not None
        # Client should be closed after exiting context
