"""Tests for model from_dict/to_dict round-trips and typed properties."""

from __future__ import annotations

from memsy.models import (
    ApiKeyInfo,
    BillingSummary,
    EventItemResponse,
    EventPayload,
    HealthResponse,
    IngestResponse,
    Invoice,
    MemoryItemResource,
    MemoryListResponse,
    MemoryScopeInfo,
    MemoryStatsResponse,
    MeResponse,
    OrgResource,
    ProInterestResponse,
    RateLimitInfo,
    RoleResource,
    SearchResult,
    SourceEvent,
    StatusResponse,
    TeamResource,
    UsageInfo,
    UsageSummaryResponse,
    UsageTimeseriesResponse,
)


class TestEventPayload:
    def test_to_dict_minimal(self):
        e = EventPayload(actor_id="u1", session_id="s1", kind="user_message", content="hello")
        d = e.to_dict()
        assert d == {
            "actor_id": "u1",
            "session_id": "s1",
            "kind": "user_message",
            "content": "hello",
        }

    def test_to_dict_with_role_and_team(self):
        e = EventPayload(
            actor_id="u1",
            session_id="s1",
            kind="user_message",
            content="hello",
            role_id="role_eng",
            team_id="team_platform",
        )
        d = e.to_dict()
        assert d["role_id"] == "role_eng"
        assert d["team_id"] == "team_platform"

    def test_to_dict_omits_none_fields(self):
        e = EventPayload(actor_id="u1", session_id="s1", kind="user_message", content="hello")
        d = e.to_dict()
        assert "role_id" not in d
        assert "team_id" not in d
        assert "ts" not in d
        assert "metadata" not in d

    def test_to_dict_includes_ts_and_metadata(self):
        e = EventPayload(
            actor_id="u1",
            session_id="s1",
            kind="user_message",
            content="hello",
            ts="2026-04-01T00:00:00Z",
            metadata='{"key": "val"}',
        )
        d = e.to_dict()
        assert d["ts"] == "2026-04-01T00:00:00Z"
        assert d["metadata"] == '{"key": "val"}'


class TestHealthResponse:
    def test_from_dict_minimal(self):
        h = HealthResponse.from_dict({"status": "ok"})
        assert h.status == "ok"
        assert h.version == ""
        assert h.billing_enabled is None
        assert h.components is None

    def test_from_dict_full(self):
        h = HealthResponse.from_dict(
            {
                "status": "ok",
                "version": "2.1.0",
                "billing_enabled": True,
                "components": {"async_memsy": "ok"},
            }
        )
        assert h.version == "2.1.0"
        assert h.billing_enabled is True
        assert h.components == {"async_memsy": "ok"}


class TestSearchResultProperties:
    def _make_result(self, metadata: dict | None = None) -> SearchResult:
        return SearchResult(id="m1", content="pref", score=0.9, metadata=metadata)

    def test_no_metadata_returns_safe_defaults(self):
        r = self._make_result(None)
        assert r.title is None
        assert r.tags == []
        assert r.entities == []
        assert r.source_events == []
        assert r.source_event_ids == []
        assert r.kind is None
        assert r.type is None
        assert r.strength is None
        assert r.confidence is None
        assert r.observed_at is None

    def test_with_metadata(self):
        r = self._make_result(
            {
                "title": "Dark mode preference",
                "summary": "User likes dark mode",
                "tags": ["ui", "pref"],
                "entities": [{"name": "dark mode"}],
                "source_event_ids": ["evt_1"],
                "kind": "preference",
                "type": "preference",
                "strength": 0.8,
                "confidence": 0.9,
                "observed_at": "2026-04-01T00:00:00Z",
            }
        )
        assert r.title == "Dark mode preference"
        assert r.summary == "User likes dark mode"
        assert r.tags == ["ui", "pref"]
        assert r.entities == [{"name": "dark mode"}]
        assert r.source_event_ids == ["evt_1"]
        assert r.kind == "preference"
        assert r.type == "preference"
        assert r.strength == 0.8
        assert r.confidence == 0.9
        assert r.observed_at == "2026-04-01T00:00:00Z"

    def test_source_events_typed(self):
        r = self._make_result(
            {
                "source_events": [
                    {
                        "event_id": "evt_1",
                        "kind": "user_message",
                        "content": "I prefer dark mode",
                        "ts": "2026-04-01T00:00:00Z",
                    }
                ]
            }
        )
        events = r.source_events
        assert len(events) == 1
        assert isinstance(events[0], SourceEvent)
        assert events[0].event_id == "evt_1"
        assert events[0].kind == "user_message"
        assert events[0].content == "I prefer dark mode"
        assert events[0].ts == "2026-04-01T00:00:00Z"


class TestSourceEvent:
    def test_from_dict(self):
        e = SourceEvent.from_dict(
            {"event_id": "evt_1", "kind": "user_message", "content": "hello", "ts": "2026-04-01"}
        )
        assert e.event_id == "evt_1"
        assert e.kind == "user_message"
        assert e.ts == "2026-04-01"

    def test_from_dict_no_ts(self):
        e = SourceEvent.from_dict({"event_id": "e1", "kind": "app_event", "content": "x"})
        assert e.ts is None


class TestIngestResponse:
    def test_from_dict(self):
        r = IngestResponse.from_dict({"event_ids": ["a", "b"]})
        assert r.event_ids == ["a", "b"]
        assert r.usage is None
        assert r.rate_limit is None


class TestStatusResponse:
    def test_from_dict(self):
        r = StatusResponse.from_dict(
            {"completedIds": ["a"], "failedIds": [], "pendingIds": ["b"], "total": 2}
        )
        assert r.completed_ids == ["a"]
        assert r.pending_ids == ["b"]
        assert r.total == 2


class TestOrgResource:
    def test_from_dict(self):
        o = OrgResource.from_dict(
            {
                "org_id": "org_1",
                "name": "My Org",
                "focus": "AI context",
                "promotion_prompt": "Promote...",
                "created_at": "2026-04-01T00:00:00Z",
                "updated_at": "2026-04-01T00:00:00Z",
            }
        )
        assert o.org_id == "org_1"
        assert o.name == "My Org"
        assert o.prompt_meta is None


class TestRoleResource:
    def test_from_dict(self):
        r = RoleResource.from_dict(
            {
                "role_id": "role_1",
                "org_id": "org_1",
                "name": "Engineering",
                "focus": "Software engineers",
                "promotion_prompt": "For engineers...",
                "created_at": "2026-04-01T00:00:00Z",
                "updated_at": "2026-04-01T00:00:00Z",
            }
        )
        assert r.role_id == "role_1"
        assert r.org_id == "org_1"


class TestTeamResource:
    def test_from_dict(self):
        t = TeamResource.from_dict(
            {
                "team_id": "team_1",
                "org_id": "org_1",
                "name": "Platform",
                "focus": "Infra",
                "promotion_prompt": "Platform...",
                "created_at": "2026-04-01T00:00:00Z",
                "updated_at": "2026-04-01T00:00:00Z",
            }
        )
        assert t.team_id == "team_1"


class TestMemoryScopeInfo:
    def test_from_dict_actor(self):
        s = MemoryScopeInfo.from_dict({"level": "actor", "actor_id": "user_1"})
        assert s.level == "actor"
        assert s.actor_id == "user_1"
        assert s.team_id is None

    def test_from_dict_team(self):
        s = MemoryScopeInfo.from_dict({"level": "team", "team_id": "team_1"})
        assert s.level == "team"
        assert s.team_id == "team_1"


class TestMemoryItemResource:
    ITEM_DICT = {
        "memory_id": "mem_1",
        "org_id": "org_1",
        "scope": {"level": "actor", "actor_id": "user_1"},
        "type": "preference",
        "kind": "fact",
        "memory_kind": "semantic",
        "status": "active",
        "text": "Prefers dark mode",
        "confidence": 0.9,
        "strength": 0.8,
        "recall_count": 1,
        "decay_half_life_days": 30.0,
        "pinned": False,
        "tags": ["ui"],
        "entity_refs": [],
        "source_event_ids": ["evt_1"],
        "source_urls": [],
    }

    def test_from_dict(self):
        item = MemoryItemResource.from_dict(self.ITEM_DICT)
        assert item.memory_id == "mem_1"
        assert item.scope.actor_id == "user_1"
        assert item.tags == ["ui"]
        assert item.source_event_ids == ["evt_1"]
        assert item.summary is None


class TestMemoryListResponse:
    def test_from_dict(self):
        r = MemoryListResponse.from_dict(
            {
                "items": [],
                "total": 0,
                "limit": 50,
                "offset": 0,
            }
        )
        assert r.items == []
        assert r.total == 0


class TestMemoryStatsResponse:
    def test_from_dict(self):
        s = MemoryStatsResponse.from_dict(
            {
                "total": 10,
                "total_memories": 10,
                "active_memories": 9,
                "by_type": {"preference": 5},
                "by_kind": {"semantic": 10},
                "by_status": {"active": 9},
                "avg_confidence": 0.85,
                "avg_strength": 0.75,
                "top_entities": [],
            }
        )
        assert s.total == 10
        assert s.by_type == {"preference": 5}
        assert s.avg_confidence == 0.85


class TestMeResponse:
    def test_from_dict(self):
        m = MeResponse.from_dict(
            {
                "customer_id": "cust_1",
                "email": "user@example.com",
                "tier": "pro",
                "is_superadmin": False,
                "org_id": "org_1",
                "is_billing_admin": True,
            }
        )
        assert m.email == "user@example.com"
        assert m.tier == "pro"
        assert m.user_id is None
        assert m.org_role is None


class TestUsageSummaryResponse:
    def test_from_dict(self):
        r = UsageSummaryResponse.from_dict(
            {
                "org_id": "org_1",
                "tier": "pro",
                "period_start": "2026-04-01",
                "period_end": "2026-04-30",
                "dimensions": [{"dimension": "api_calls", "used": 100, "limit": 50000}],
            }
        )
        assert r.tier == "pro"
        assert len(r.dimensions) == 1
        assert r.dimensions[0].dimension == "api_calls"


class TestUsageTimeseriesResponse:
    def test_from_dict(self):
        r = UsageTimeseriesResponse.from_dict(
            {
                "org_id": "org_1",
                "granularity": "daily",
                "data": [{"date": "2026-04-01", "dimension": "api_calls", "quantity": 50}],
            }
        )
        assert r.granularity == "daily"
        assert r.data[0].quantity == 50


class TestBillingSummary:
    def test_from_dict_no_payment_method(self):
        b = BillingSummary.from_dict(
            {
                "tier": "pro",
                "purchased_seats": 5,
                "assigned_seats": 3,
                "available_seats": 2,
            }
        )
        assert b.tier == "pro"
        assert b.payment_method is None
        assert b.upcoming_invoice is None

    def test_from_dict_with_payment_method(self):
        b = BillingSummary.from_dict(
            {
                "tier": "pro",
                "purchased_seats": 5,
                "assigned_seats": 3,
                "available_seats": 2,
                "payment_method": {
                    "brand": "visa",
                    "last4": "4242",
                    "exp_month": 12,
                    "exp_year": 2028,
                },
                "upcoming_invoice": {
                    "amount_due": 4900,
                    "currency": "usd",
                    "period_end": "2026-05-01",
                },
            }
        )
        assert b.payment_method is not None
        assert b.payment_method.brand == "visa"
        assert b.upcoming_invoice is not None
        assert b.upcoming_invoice.amount_due == 4900


class TestInvoice:
    def test_from_dict(self):
        inv = Invoice.from_dict(
            {
                "id": "inv_1",
                "amount_due": 4900,
                "amount_paid": 4900,
                "currency": "usd",
                "status": "paid",
                "created": 1711584000,
            }
        )
        assert inv.id == "inv_1"
        assert inv.status == "paid"
        assert inv.hosted_invoice_url is None


class TestApiKeyInfo:
    def test_from_dict(self):
        k = ApiKeyInfo.from_dict(
            {
                "key_id": "key_1",
                "prefix": "msy_abc",
                "name": "ci",
                "scopes": ["read"],
                "is_active": True,
                "created_at": "2026-04-01T00:00:00Z",
            }
        )
        assert k.key_id == "key_1"
        assert k.scopes == ["read"]
        assert k.last_used_at is None


class TestEventItemResponse:
    def test_from_dict(self):
        e = EventItemResponse.from_dict(
            {
                "event_id": "evt_1",
                "org_id": "org_1",
                "actor_id": "user_1",
                "session_id": "s1",
                "kind": "user_message",
                "content": "Hello",
                "ts": "2026-04-01T00:00:00Z",
            }
        )
        assert e.event_id == "evt_1"
        assert e.actor_id == "user_1"
        assert e.session_id == "s1"


class TestProInterestResponse:
    def test_from_dict(self):

        r = ProInterestResponse.from_dict({"message": "Interest recorded"})
        assert r.message == "Interest recorded"


class TestUsageInfo:
    def test_from_headers_empty(self):
        u = UsageInfo.from_headers({})
        assert u.api_calls is None
        assert u.plan is None

    def test_from_headers_populated(self):
        u = UsageInfo.from_headers(
            {
                "X-Usage-ApiCalls": "100",
                "X-Usage-ApiCalls-Limit": "50000",
                "X-Plan": "pro",
            }
        )
        assert u.api_calls == 100
        assert u.api_calls_limit == 50000
        assert u.plan == "pro"


class TestRateLimitInfo:
    def test_from_headers_empty(self):
        r = RateLimitInfo.from_headers({})
        assert r.limit is None
        assert r.remaining is None

    def test_from_headers_populated(self):
        r = RateLimitInfo.from_headers(
            {
                "X-RateLimit-Limit": "1000",
                "X-RateLimit-Remaining": "950",
                "X-RateLimit-Reset": "1711584000",
            }
        )
        assert r.limit == 1000
        assert r.remaining == 950
        assert r.reset == 1711584000
