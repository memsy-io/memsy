"""Tests for error classification in MemsyClient."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from memsy import MemsyClient
from memsy.exceptions import (
    AuthenticationError,
    AuthorizationError,
    BillingNotEnabledError,
    FeatureNotAvailable,
    KeyLimitReachedError,
    OrgIdNotAllowedError,
    OrgLimitReachedError,
    RateLimitExceeded,
    SeatLimitReachedError,
    SeatRequiredError,
    UsageLimitExceeded,
)


@pytest.fixture
def client():
    """Create a test client."""
    return MemsyClient(base_url="https://test.memsy.io", api_key="test_key")


class TestAuthenticationErrors:
    """Tests for 401 AuthenticationError."""

    @patch("httpx.Client.request")
    def test_401_missing_api_key(self, mock_request, client):
        """Test 401 with invalid API key raises AuthenticationError."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.is_success = False
        mock_response.json.return_value = {"detail": "Invalid API key"}
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(AuthenticationError) as exc_info:
            client.health()
        
        assert exc_info.value.status_code == 401
        assert "Invalid API key" in exc_info.value.detail

    @patch("httpx.Client.request")
    def test_401_missing_bearer_token(self, mock_request, client):
        """Test 401 with missing Bearer token raises AuthenticationError."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.is_success = False
        mock_response.json.return_value = {"detail": "Missing Authorization header"}
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(AuthenticationError):
            client.health()


class TestAuthorizationErrors:
    """Tests for 403 AuthorizationError."""

    @patch("httpx.Client.request")
    def test_403_wrong_scope(self, mock_request, client):
        """Test 403 with wrong scope raises AuthorizationError."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "wrong_scope",
            "detail": "API key missing 'write' scope",
            "required_scope": "write",
        }
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(AuthorizationError) as exc_info:
            client.ingest([])
        
        assert exc_info.value.status_code == 403
        assert exc_info.value.required_scope == "write"

    @patch("httpx.Client.request")
    def test_403_generic_forbidden(self, mock_request, client):
        """Test generic 403 raises AuthorizationError."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "detail": "Access denied",
        }
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(AuthorizationError) as exc_info:
            client.health()
        
        assert exc_info.value.status_code == 403


class TestFeatureNotAvailable:
    """Tests for 403 FeatureNotAvailable."""

    @patch("httpx.Client.request")
    def test_feature_not_available(self, mock_request, client):
        """Test 403 with feature_not_available raises FeatureNotAvailable."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "feature_not_available",
            "detail": "Reranking not available on your plan",
            "feature": "reranking",
            "current_tier": "free",
            "upgrade_url": "https://memsy.io/upgrade",
        }
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(FeatureNotAvailable) as exc_info:
            client.search("test")
        
        assert exc_info.value.feature == "reranking"
        assert exc_info.value.current_tier == "free"
        assert exc_info.value.upgrade_url == "https://memsy.io/upgrade"


class TestRateLimitExceeded:
    """Tests for 429 RateLimitExceeded."""

    @patch("httpx.Client.request")
    def test_rate_limit_exceeded(self, mock_request, client):
        """Test 429 rate limit raises RateLimitExceeded."""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.is_success = False
        mock_response.json.return_value = {
            "detail": "Rate limit exceeded",
        }
        mock_response.headers = {"Retry-After": "60"}

        mock_request.return_value = mock_response

        # Override max_retries to 0 to avoid retry logic
        client._max_retries = 0

        with pytest.raises(RateLimitExceeded) as exc_info:
            client.health()
        
        assert exc_info.value.status_code == 429
        assert exc_info.value.retry_after == 60.0


class TestUsageLimitExceeded:
    """Tests for 429 UsageLimitExceeded."""

    @patch("httpx.Client.request")
    def test_usage_limit_exceeded(self, mock_request, client):
        """Test 429 with usage quota raises UsageLimitExceeded."""
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

        # Override max_retries to 0 to avoid retry logic
        client._max_retries = 0

        with pytest.raises(UsageLimitExceeded) as exc_info:
            client.ingest([])

        assert exc_info.value.status_code == 429
        assert exc_info.value.dimension == "events"
        assert exc_info.value.current == 25001
        assert exc_info.value.limit == 25000
        assert exc_info.value.upgrade_url == "https://memsy.io/upgrade"


class TestOrgIdNotAllowedError:
    """Tests for 400 OrgIdNotAllowedError."""

    @patch("httpx.Client.request")
    def test_400_org_id_not_allowed(self, mock_request, client):
        """Test 400 org_id_not_allowed raises OrgIdNotAllowedError."""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "org_id_not_allowed",
            "message": "Free tier cannot pass org_id",
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(OrgIdNotAllowedError) as exc_info:
            client.search("test")

        assert exc_info.value.status_code == 400
        assert exc_info.value.error_code == "org_id_not_allowed"

    @patch("httpx.Client.request")
    def test_400_org_id_not_allowed_fastapi_envelope(self, mock_request, client):
        """Test FastAPI-wrapped 400 org_id_not_allowed raises OrgIdNotAllowedError."""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.is_success = False
        mock_response.json.return_value = {
            "detail": {
                "error": "org_id_not_allowed",
                "message": "Free tier cannot pass org_id",
            }
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(OrgIdNotAllowedError):
            client.ingest([])


class TestSeatRequiredError:
    """Tests for 403 SeatRequiredError."""

    @patch("httpx.Client.request")
    def test_403_seat_required(self, mock_request, client):
        """Test 403 seat_required raises SeatRequiredError."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "seat_required",
            "message": "This endpoint requires an assigned seat",
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(SeatRequiredError) as exc_info:
            client.health()

        assert exc_info.value.status_code == 403
        assert exc_info.value.error_code == "seat_required"


class TestOrgLimitReachedError:
    """Tests for 403 OrgLimitReachedError."""

    @patch("httpx.Client.request")
    def test_403_org_limit_reached(self, mock_request, client):
        """Test 403 org_limit_reached raises OrgLimitReachedError with limit/current."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "org_limit_reached",
            "message": "Org limit reached",
            "limit": 5,
            "current": 5,
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(OrgLimitReachedError) as exc_info:
            client.health()

        assert exc_info.value.status_code == 403
        assert exc_info.value.limit == 5
        assert exc_info.value.current == 5


class TestKeyLimitReachedError:
    """Tests for 403 KeyLimitReachedError."""

    @patch("httpx.Client.request")
    def test_403_key_limit_reached(self, mock_request, client):
        """Test 403 key_limit_reached raises KeyLimitReachedError with limit/current."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "key_limit_reached",
            "message": "API key limit reached",
            "limit": 10,
            "current": 10,
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(KeyLimitReachedError) as exc_info:
            client.health()

        assert exc_info.value.status_code == 403
        assert exc_info.value.limit == 10
        assert exc_info.value.current == 10


class TestBillingNotEnabledError:
    """Tests for 403 BillingNotEnabledError."""

    @patch("httpx.Client.request")
    def test_403_billing_not_enabled(self, mock_request, client):
        """Test 403 billing_not_enabled raises BillingNotEnabledError with interest_path."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "billing_not_enabled",
            "message": "Billing not enabled",
            "interest_path": "/interest/express",
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(BillingNotEnabledError) as exc_info:
            client.health()

        assert exc_info.value.status_code == 403
        assert exc_info.value.interest_path == "/interest/express"


class TestSeatLimitReachedError:
    """Tests for 409 SeatLimitReachedError."""

    @patch("httpx.Client.request")
    def test_409_seat_limit_reached(self, mock_request, client):
        """Test 409 seat_limit_reached raises SeatLimitReachedError with seat counts."""
        mock_response = MagicMock()
        mock_response.status_code = 409
        mock_response.is_success = False
        mock_response.json.return_value = {
            "error": "seat_limit_reached",
            "message": "Seat limit reached",
            "purchased_seats": 5,
            "assigned_seats": 5,
            "pending_invites": 0,
        }
        mock_response.headers = {}
        mock_request.return_value = mock_response

        with pytest.raises(SeatLimitReachedError) as exc_info:
            client.health()

        assert exc_info.value.status_code == 409
        assert exc_info.value.purchased_seats == 5
        assert exc_info.value.assigned_seats == 5
        assert exc_info.value.pending_invites == 0

