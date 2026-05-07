"""Tests for usage header parsing in MemsyClient."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from memsy import MemsyClient
from memsy.models import RateLimitInfo, UsageInfo


@pytest.fixture
def client():
    """Create a test client."""
    return MemsyClient(base_url="https://test.memsy.io", api_key="test_key")


class TestUsageInfoParsing:
    """Tests for UsageInfo parsing from headers."""

    def test_parse_all_usage_headers(self):
        """Test parsing all usage headers correctly."""
        headers = {
            "X-Usage-ApiCalls": "100",
            "X-Usage-ApiCalls-Limit": "500000",
            "X-Usage-EventsIngested": "25000",
            "X-Usage-EventsIngested-Limit": "100000",
            "X-Usage-MemoriesStored": "5000",
            "X-Usage-MemoriesStored-Limit": "50000",
            "X-Usage-LlmTokens": "100000",
            "X-Usage-LlmTokens-Limit": "1000000",
            "X-Usage-SearchQueries": "5000",
            "X-Usage-SearchQueries-Limit": "50000",
            "X-Plan": "pro",
        }
        
        usage = UsageInfo.from_headers(headers)
        
        assert usage.api_calls == 100
        assert usage.api_calls_limit == 500000
        assert usage.events_ingested == 25000
        assert usage.events_ingested_limit == 100000
        assert usage.memory_stored == 5000
        assert usage.memory_stored_limit == 50000
        assert usage.llm_tokens == 100000
        assert usage.llm_tokens_limit == 1000000
        assert usage.search_queries == 5000
        assert usage.search_queries_limit == 50000
        assert usage.plan == "pro"

    def test_parse_partial_usage_headers(self):
        """Test parsing partial usage headers."""
        headers = {
            "X-Usage-ApiCalls": "100",
            "X-Plan": "free",
        }
        
        usage = UsageInfo.from_headers(headers)
        
        assert usage.api_calls == 100
        assert usage.api_calls_limit is None
        assert usage.plan == "free"

    def test_parse_empty_headers(self):
        """Test parsing with no usage headers returns all None."""
        headers = {}
        
        usage = UsageInfo.from_headers(headers)
        
        assert usage.api_calls is None
        assert usage.api_calls_limit is None
        assert usage.plan is None

    def test_parse_invalid_int_values(self):
        """Test parsing with invalid integer values."""
        headers = {
            "X-Usage-ApiCalls": "not-a-number",
            "X-Usage-ApiCalls-Limit": "500000",
        }
        
        usage = UsageInfo.from_headers(headers)
        
        assert usage.api_calls is None  # Invalid value
        assert usage.api_calls_limit == 500000  # Valid value


class TestRateLimitInfoParsing:
    """Tests for RateLimitInfo parsing from headers."""

    def test_parse_all_rate_limit_headers(self):
        """Test parsing all rate limit headers correctly."""
        headers = {
            "X-RateLimit-Limit": "1000",
            "X-RateLimit-Remaining": "950",
            "X-RateLimit-Reset": "1711584000",
        }
        
        rate_limit = RateLimitInfo.from_headers(headers)
        
        assert rate_limit.limit == 1000
        assert rate_limit.remaining == 950
        assert rate_limit.reset == 1711584000

    def test_parse_partial_rate_limit_headers(self):
        """Test parsing partial rate limit headers."""
        headers = {
            "X-RateLimit-Limit": "1000",
            "X-RateLimit-Remaining": "950",
        }
        
        rate_limit = RateLimitInfo.from_headers(headers)
        
        assert rate_limit.limit == 1000
        assert rate_limit.remaining == 950
        assert rate_limit.reset is None

    def test_parse_empty_rate_limit_headers(self):
        """Test parsing with no rate limit headers returns all None."""
        headers = {}
        
        rate_limit = RateLimitInfo.from_headers(headers)
        
        assert rate_limit.limit is None
        assert rate_limit.remaining is None
        assert rate_limit.reset is None

    def test_parse_invalid_int_values(self):
        """Test parsing with invalid integer values."""
        headers = {
            "X-RateLimit-Limit": "not-a-number",
            "X-RateLimit-Remaining": "950",
        }
        
        rate_limit = RateLimitInfo.from_headers(headers)
        
        assert rate_limit.limit is None  # Invalid value
        assert rate_limit.remaining == 950  # Valid value


class TestClientResponseHeaders:
    """Tests for client parsing headers from responses."""

    def test_parse_response_headers_all_present(self, client):
        """Test parsing when both usage and rate limit headers present."""
        from unittest.mock import patch
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"status": "ok"}
        mock_response.headers = {
            "X-Usage-ApiCalls": "100",
            "X-Usage-ApiCalls-Limit": "500000",
            "X-Plan": "pro",
            "X-RateLimit-Limit": "1000",
            "X-RateLimit-Remaining": "950",
        }

        with patch.object(client._client, 'request', return_value=mock_response):
            result = client.health()
            
            assert result.usage is not None
            assert result.usage.api_calls == 100
            assert result.usage.plan == "pro"
            assert result.rate_limit is not None
            assert result.rate_limit.limit == 1000

    def test_parse_response_headers_only_usage(self, client):
        """Test parsing when only usage headers present."""
        from unittest.mock import patch
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"status": "ok"}
        mock_response.headers = {
            "X-Usage-ApiCalls": "100",
            "X-Plan": "free",
        }

        with patch.object(client._client, 'request', return_value=mock_response):
            result = client.health()
            
            assert result.usage is not None
            assert result.usage.api_calls == 100
            assert result.rate_limit is None

    def test_parse_response_headers_only_rate_limit(self, client):
        """Test parsing when only rate limit headers present."""
        from unittest.mock import patch
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"status": "ok"}
        mock_response.headers = {
            "X-RateLimit-Limit": "1000",
            "X-RateLimit-Remaining": "950",
        }

        with patch.object(client._client, 'request', return_value=mock_response):
            result = client.health()
            
            assert result.usage is None
            assert result.rate_limit is not None
            assert result.rate_limit.limit == 1000

    def test_parse_response_headers_none_present(self, client):
        """Test parsing when no headers present."""
        from unittest.mock import patch
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"status": "ok"}
        mock_response.headers = {}

        with patch.object(client._client, 'request', return_value=mock_response):
            result = client.health()
            
            assert result.usage is None
            assert result.rate_limit is None
