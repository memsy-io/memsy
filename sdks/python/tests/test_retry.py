"""Tests for retry logic in MemsyClient."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from memsy import MemsyClient
from memsy.exceptions import MemsyAPIError, RateLimitExceeded


@pytest.fixture
def client():
    """Create a test client with low retry settings for faster tests."""
    return MemsyClient(
        base_url="https://test.memsy.io",
        api_key="test_key",
        max_retries=2,
        retry_backoff=0.1,
    )


class TestRetryLogic:
    """Tests for 429 retry logic."""

    @patch("httpx.Client.request")
    @patch("time.sleep")
    def test_429_retry_success(self, mock_sleep, mock_request, client):
        """Test that 429 triggers retry and eventually succeeds."""
        mock_response_429 = MagicMock()
        mock_response_429.status_code = 429
        mock_response_429.is_success = False
        mock_response_429.json.return_value = {"detail": "Rate limited"}
        mock_response_429.headers = {"Retry-After": "0.2"}

        mock_response_ok = MagicMock()
        mock_response_ok.status_code = 200
        mock_response_ok.is_success = True
        mock_response_ok.json.return_value = {"status": "ok"}
        mock_response_ok.headers = {}

        mock_request.side_effect = [mock_response_429, mock_response_ok]

        result = client.health()
        
        assert result.status == "ok"
        # Verify sleep was called with retry-after value
        mock_sleep.assert_called_once_with(0.2)

    @patch("httpx.Client.request")
    @patch("time.sleep")
    def test_429_retry_with_exponential_backoff(self, mock_sleep, mock_request, client):
        """Test that retries use exponential backoff when no Retry-After header."""
        mock_response_1 = MagicMock()
        mock_response_1.status_code = 429
        mock_response_1.is_success = False
        mock_response_1.json.return_value = {"detail": "Rate limited"}
        mock_response_1.headers = {}

        mock_response_2 = MagicMock()
        mock_response_2.status_code = 429
        mock_response_2.is_success = False
        mock_response_2.json.return_value = {"detail": "Rate limited"}
        mock_response_2.headers = {}

        mock_response_ok = MagicMock()
        mock_response_ok.status_code = 200
        mock_response_ok.is_success = True
        mock_response_ok.json.return_value = {"status": "ok"}
        mock_response_ok.headers = {}

        mock_request.side_effect = [mock_response_1, mock_response_2, mock_response_ok]

        result = client.health()
        
        assert result.status == "ok"
        # Verify exponential backoff was used
        assert mock_sleep.call_count == 2  # Once per failed attempt
        # First retry: backoff 0.1, second retry: backoff 0.2
        mock_sleep.assert_any_call(0.1)
        mock_sleep.assert_any_call(0.2)

    @patch("httpx.Client.request")
    @patch("time.sleep")
    def test_429_max_retries_raises_rate_limit_exceeded(self, mock_sleep, mock_request, client):
        """Test that after max retries, RateLimitExceeded is raised."""
        # All requests return 429
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.is_success = False
        mock_response.json.return_value = {"detail": "Rate limited"}
        mock_response.headers = {"Retry-After": "0.1"}

        mock_request.return_value = mock_response

        with pytest.raises(RateLimitExceeded) as exc_info:
            client.health()
        
        assert exc_info.value.status_code == 429
        assert exc_info.value.retry_after == 0.1

    @patch("httpx.Client.request")
    @patch("time.sleep")
    def test_retry_count_respects_max_retries_config(self, mock_sleep, mock_request):
        """Test that retry count respects max_retries configuration."""
        client = MemsyClient(
            base_url="https://test.memsy.io",
            api_key="test_key",
            max_retries=1,  # Only 1 retry
            retry_backoff=0.1,
        )

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.is_success = False
        mock_response.json.return_value = {"detail": "Rate limited"}
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(RateLimitExceeded):
            client.health()
        
        # max_retries=1 means 1 sleep before the retry, not 2
        assert mock_sleep.call_count == 1


class TestNonRetryableErrors:
    """Tests that non-429 errors are not retried."""

    @patch("httpx.Client.request")
    @patch("time.sleep")
    def test_401_not_retried(self, mock_sleep, mock_request, client):
        """Test that 401 errors are not retried."""
        from memsy.exceptions import AuthenticationError

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.is_success = False
        mock_response.json.return_value = {"detail": "Unauthorized"}
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(AuthenticationError):
            client.health()
        
        # Sleep should not be called for 401
        assert mock_sleep.call_count == 0

    @patch("httpx.Client.request")
    @patch("time.sleep")
    def test_500_not_retried(self, mock_sleep, mock_request, client):
        """Test that 500 errors are not retried."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.is_success = False
        mock_response.json.return_value = {"detail": "Internal server error"}
        mock_response.headers = {}

        mock_request.return_value = mock_response

        with pytest.raises(MemsyAPIError) as exc_info:
            client.health()
        
        assert exc_info.value.status_code == 500
        # Sleep should not be called for 500
        assert mock_sleep.call_count == 0
