"""Tests for MemsyControlClient and its sub-resources."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from memsy import MemsyControlClient
from memsy.exceptions import AuthenticationError, MemsyConnectionError


def _make_response(status_code: int, body: object, headers: dict | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json.return_value = body
    resp.headers = headers or {}
    resp.content = b"x"
    return resp


@pytest.fixture
def client():
    return MemsyControlClient(base_url="https://api.test.memsy.io", api_key="test_key")


class TestControlClientInit:
    def test_init_defaults(self):
        c = MemsyControlClient(base_url="https://api.test.memsy.io", api_key="test_key")
        assert c._base_url == "https://api.test.memsy.io"
        assert c._max_retries == 3

    def test_auth_header(self, client):
        assert client._client.headers.get("Authorization") == "Bearer test_key"

    def test_sub_resources_present(self, client):
        assert hasattr(client, "usage")
        assert hasattr(client, "billing")
        assert hasattr(client, "keys")
        assert hasattr(client, "events")
        assert hasattr(client, "interest")


class TestControlClientMe:
    @patch("httpx.Client.request")
    def test_me_success(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "customer_id": "cust_1",
                "email": "user@example.com",
                "tier": "pro",
                "is_superadmin": False,
                "org_id": "org_1",
                "is_billing_admin": True,
            },
        )
        me = client.me()
        assert me.email == "user@example.com"
        assert me.tier == "pro"
        assert me.is_billing_admin is True

    @patch("httpx.Client.request")
    def test_me_401_raises_authentication_error(self, mock_request, client):
        resp = _make_response(401, {"detail": "Invalid API key"})
        resp.is_success = False
        mock_request.return_value = resp
        with pytest.raises(AuthenticationError):
            client.me()


class TestControlClientHealth:
    @patch("httpx.Client.request")
    def test_health_success(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {"status": "ok", "version": "1.0.0", "billing_enabled": True},
        )
        h = client.health()
        assert h.status == "ok"
        assert h.billing_enabled is True


class TestUsageResource:
    @patch("httpx.Client.request")
    def test_usage_summary(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "org_id": "org_1",
                "tier": "pro",
                "period_start": "2026-04-01",
                "period_end": "2026-04-30",
                "dimensions": [{"dimension": "api_calls", "used": 1000, "limit": 50000}],
            },
        )
        summary = client.usage.summary()
        assert summary.tier == "pro"
        assert len(summary.dimensions) == 1
        assert summary.dimensions[0].dimension == "api_calls"
        assert summary.dimensions[0].used == 1000

    @patch("httpx.Client.request")
    def test_usage_timeseries(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "org_id": "org_1",
                "granularity": "daily",
                "data": [{"date": "2026-04-01", "dimension": "api_calls", "quantity": 100}],
            },
        )
        ts = client.usage.timeseries(dimension="api_calls")
        assert ts.granularity == "daily"
        assert ts.data[0].date == "2026-04-01"
        assert ts.data[0].quantity == 100


class TestBillingResource:
    @patch("httpx.Client.request")
    def test_billing_summary(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "tier": "pro",
                "purchased_seats": 5,
                "assigned_seats": 3,
                "available_seats": 2,
                "subscription_status": "active",
            },
        )
        billing = client.billing.summary()
        assert billing.tier == "pro"
        assert billing.purchased_seats == 5
        assert billing.subscription_status == "active"

    @patch("httpx.Client.request")
    def test_billing_invoices(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            [
                {
                    "id": "inv_1",
                    "amount_due": 4900,
                    "amount_paid": 4900,
                    "currency": "usd",
                    "status": "paid",
                    "created": 1711584000,
                }
            ],
        )
        invoices = client.billing.invoices()
        assert len(invoices) == 1
        assert invoices[0].status == "paid"
        assert invoices[0].amount_due == 4900


class TestKeysResource:
    @patch("httpx.Client.request")
    def test_keys_list(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "keys": [
                    {
                        "key_id": "key_1",
                        "prefix": "msy_abc",
                        "name": "ci",
                        "scopes": ["read"],
                        "is_active": True,
                        "created_at": "2026-04-01T00:00:00Z",
                    }
                ],
                "active_count": 1,
                "max_keys": 10,
            },
        )
        resp = client.keys.list()
        assert resp.active_count == 1
        assert resp.keys[0].name == "ci"

    @patch("httpx.Client.request")
    def test_keys_create(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "key_id": "key_2",
                "prefix": "msy_xyz",
                "name": "ci-key",
                "scopes": ["read"],
                "is_active": True,
                "created_at": "2026-04-01T00:00:00Z",
                "raw_key": "msy_xyz_secret",
            },
        )
        new_key = client.keys.create("ci-key", scopes=["read"])
        assert new_key.name == "ci-key"
        assert new_key.raw_key == "msy_xyz_secret"

    @patch("httpx.Client.request")
    def test_keys_delete_204(self, mock_request, client):
        resp = _make_response(204, {})
        resp.content = b""
        resp.is_success = True
        mock_request.return_value = resp
        # Should not raise
        client.keys.delete("key_1")


class TestEventsResource:
    @patch("httpx.Client.request")
    def test_events_list(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "items": [
                    {
                        "event_id": "evt_1",
                        "org_id": "org_1",
                        "actor_id": "user_1",
                        "session_id": "s1",
                        "kind": "user_message",
                        "content": "Hello",
                        "ts": "2026-04-01T00:00:00Z",
                    }
                ],
                "total": 1,
                "limit": 50,
                "offset": 0,
            },
        )
        events = client.events.list(actor_id="user_1")
        assert events.total == 1
        assert events.items[0].actor_id == "user_1"
        assert events.items[0].kind == "user_message"


class TestInterestResource:
    @patch("httpx.Client.request")
    def test_interest_express(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {"message": "Interest recorded"},
        )
        result = client.interest.express(
            email="user@example.com",
            name="Test User",
            company="Acme",
            use_case="AI assistant",
        )
        assert result.message == "Interest recorded"

    @patch("httpx.Client.request")
    def test_interest_status_true(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"expressed": True})
        assert client.interest.status() is True

    @patch("httpx.Client.request")
    def test_interest_status_false(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"expressed": False})
        assert client.interest.status() is False


class TestControlClientContextManager:
    def test_context_manager_closes_client(self):
        with MemsyControlClient(
            base_url="https://api.test.memsy.io", api_key="test_key"
        ) as c:
            assert c._client is not None


class TestControlClientConnectionError:
    @patch("httpx.Client.request", side_effect=httpx.ConnectError("refused"))
    def test_connection_error(self, mock_request, client):
        with pytest.raises(MemsyConnectionError):
            client.me()
