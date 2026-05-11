from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

# ============== Usage & Rate Limit Info ==============


@dataclass
class UsageInfo:
    """Usage information parsed from X-Usage-* response headers."""

    api_calls: int | None = None
    api_calls_limit: int | None = None
    events_ingested: int | None = None
    events_ingested_limit: int | None = None
    memory_stored: int | None = None
    memory_stored_limit: int | None = None
    llm_tokens: int | None = None
    llm_tokens_limit: int | None = None
    search_queries: int | None = None
    search_queries_limit: int | None = None
    plan: str | None = None

    @classmethod
    def from_headers(cls, headers: Mapping[str, str]) -> UsageInfo:
        """Parse usage info from response headers."""
        return cls(
            api_calls=_parse_int_header(headers, "X-Usage-ApiCall"),
            api_calls_limit=_parse_int_header(headers, "X-Usage-ApiCall-Limit"),
            events_ingested=_parse_int_header(headers, "X-Usage-EventsIngested"),
            events_ingested_limit=_parse_int_header(headers, "X-Usage-EventsIngested-Limit"),
            memory_stored=_parse_int_header(headers, "X-Usage-MemoryStored"),
            memory_stored_limit=_parse_int_header(headers, "X-Usage-MemoryStored-Limit"),
            llm_tokens=_parse_int_header(headers, "X-Usage-LlmTokens"),
            llm_tokens_limit=_parse_int_header(headers, "X-Usage-LlmTokens-Limit"),
            search_queries=_parse_int_header(headers, "X-Usage-SearchQueries"),
            search_queries_limit=_parse_int_header(headers, "X-Usage-SearchQueries-Limit"),
            plan=headers.get("X-Plan"),
        )


@dataclass
class RateLimitInfo:
    """Rate limit information parsed from X-RateLimit-* response headers."""

    limit: int | None = None
    remaining: int | None = None
    reset: int | None = None  # Unix timestamp

    @classmethod
    def from_headers(cls, headers: Mapping[str, str]) -> RateLimitInfo:
        """Parse rate limit info from response headers."""
        return cls(
            limit=_parse_int_header(headers, "X-RateLimit-Limit"),
            remaining=_parse_int_header(headers, "X-RateLimit-Remaining"),
            reset=_parse_int_header(headers, "X-RateLimit-Reset"),
        )


def _parse_int_header(headers: Mapping[str, str], name: str) -> int | None:
    """Parse an integer header value, returning None if missing or invalid."""
    value = headers.get(name)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


# ============== Requests ==============


@dataclass
class EventPayload:
    """A single event to ingest into Memsy."""

    actor_id: str
    session_id: str
    kind: str  # "user_message" | "assistant_message" | "tool_result" | "app_event"
    content: str
    role_id: str | None = None
    team_id: str | None = None
    ts: str | None = None  # ISO 8601 timestamp
    metadata: str | None = None  # JSON-serialised string

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "actor_id": self.actor_id,
            "session_id": self.session_id,
            "kind": self.kind,
            "content": self.content,
        }
        if self.role_id is not None:
            d["role_id"] = self.role_id
        if self.team_id is not None:
            d["team_id"] = self.team_id
        if self.ts is not None:
            d["ts"] = self.ts
        if self.metadata is not None:
            d["metadata"] = self.metadata
        return d


# ============== Core Responses ==============


@dataclass
class IngestResponse:
    """Response from a batch ingest call."""

    event_ids: list[str]
    usage: UsageInfo | None = None
    rate_limit: RateLimitInfo | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> IngestResponse:
        return cls(event_ids=data["event_ids"])


@dataclass
class SourceEvent:
    """A source event attached to a SearchResult when include_source_events=True."""

    event_id: str
    kind: str
    content: str
    ts: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SourceEvent:
        return cls(
            event_id=data["event_id"],
            kind=data["kind"],
            content=data["content"],
            ts=data.get("ts"),
        )


@dataclass
class SearchResult:
    """A single memory result from a search."""

    id: str
    content: str
    score: float
    metadata: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SearchResult:
        return cls(
            id=data["id"],
            content=data["content"],
            score=data["score"],
            metadata=data.get("metadata"),
        )

    def _meta(self, key: str, default: Any = None) -> Any:
        return self.metadata.get(key, default) if self.metadata else default

    @property
    def title(self) -> str | None:
        return self._meta("title")

    @property
    def summary(self) -> str | None:
        return self._meta("summary")

    @property
    def tags(self) -> list[str]:
        return self._meta("tags") or []

    @property
    def entities(self) -> list[dict[str, Any]]:
        return self._meta("entities") or []

    @property
    def source_event_ids(self) -> list[str]:
        return self._meta("source_event_ids") or []

    @property
    def source_events(self) -> list[SourceEvent]:
        raw = self._meta("source_events") or []
        return [SourceEvent.from_dict(e) for e in raw]

    @property
    def source_metadata(self) -> list[dict[str, Any]]:
        """User-supplied metadata from the source event(s) this memory was
        extracted from. Each entry is `{"event_id": str, "metadata": dict}` for
        JSON-object payloads, or `{"event_id": str, "raw": str}` for non-JSON
        strings the caller passed. Capped at 5 entries.
        """
        return self._meta("source_metadata") or []

    @property
    def kind(self) -> str | None:
        return self._meta("kind")

    @property
    def type(self) -> str | None:
        return self._meta("type")

    @property
    def strength(self) -> float | None:
        """Reinforcement strength, bounded ``0.0``–``5.0`` by platform policy.
        Starts at 1.0 and grows with search hits; not a probability —
        don't normalise to [0, 1]."""
        return self._meta("strength")

    @property
    def confidence(self) -> float | None:
        return self._meta("confidence")

    @property
    def observed_at(self) -> str | None:
        return self._meta("observed_at")


@dataclass
class SearchResponse:
    """Response from a search call."""

    results: list[SearchResult]
    usage: UsageInfo | None = None
    rate_limit: RateLimitInfo | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SearchResponse:
        return cls(results=[SearchResult.from_dict(r) for r in data.get("results", [])])


@dataclass
class StatusResponse:
    """Response from a status check call."""

    completed_ids: list[str]
    failed_ids: list[str]
    pending_ids: list[str]
    total: int
    statuses: dict[str, str] | None = None
    usage: UsageInfo | None = None
    rate_limit: RateLimitInfo | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StatusResponse:
        return cls(
            completed_ids=data.get("completedIds", []),
            failed_ids=data.get("failedIds", []),
            pending_ids=data.get("pendingIds", []),
            total=data.get("total", 0),
            statuses=data.get("statuses"),
        )


@dataclass
class HealthResponse:
    """Response from a health check."""

    status: str
    version: str = ""
    billing_enabled: bool | None = None
    components: dict[str, str] | None = None
    usage: UsageInfo | None = None
    rate_limit: RateLimitInfo | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> HealthResponse:
        return cls(
            status=data.get("status", "unknown"),
            version=data.get("version", ""),
            billing_enabled=data.get("billing_enabled"),
            components=data.get("components"),
        )


@dataclass
class ClearResponse:
    """Response from a clear call."""

    deleted: int
    usage: UsageInfo | None = None
    rate_limit: RateLimitInfo | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ClearResponse:
        return cls(deleted=data.get("deleted", 0))


# ============== Onboarding Models ==============


def _onboarding_base(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": data["name"],
        "focus": data["focus"],
        "promotion_prompt": data["promotion_prompt"],
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "prompt_meta": data.get("prompt_meta"),
    }


@dataclass
class OrgResource:
    """An org customization record from the onboarding API."""

    org_id: str
    name: str
    focus: str
    promotion_prompt: str
    created_at: str
    updated_at: str
    prompt_meta: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> OrgResource:
        return cls(org_id=data["org_id"], **_onboarding_base(data))


@dataclass
class RoleResource:
    """A role customization record from the onboarding API."""

    role_id: str
    org_id: str
    name: str
    focus: str
    promotion_prompt: str
    created_at: str
    updated_at: str
    prompt_meta: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RoleResource:
        return cls(role_id=data["role_id"], org_id=data["org_id"], **_onboarding_base(data))


@dataclass
class TeamResource:
    """A team customization record from the onboarding API."""

    team_id: str
    org_id: str
    name: str
    focus: str
    promotion_prompt: str
    created_at: str
    updated_at: str
    prompt_meta: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TeamResource:
        return cls(team_id=data["team_id"], org_id=data["org_id"], **_onboarding_base(data))


# ============== Console Memory Models ==============


@dataclass
class MemoryScopeInfo:
    """Scope information attached to a memory item."""

    level: str
    actor_id: str | None = None
    team_id: str | None = None
    role_id: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MemoryScopeInfo:
        return cls(
            level=data["level"],
            actor_id=data.get("actor_id"),
            team_id=data.get("team_id"),
            role_id=data.get("role_id"),
        )


@dataclass
class MemoryItemResource:
    """A single memory item from the console memories API."""

    memory_id: str
    org_id: str
    scope: MemoryScopeInfo
    type: str
    kind: str
    memory_kind: str
    status: str
    text: str
    confidence: float
    strength: float
    recall_count: int
    decay_half_life_days: float
    pinned: bool
    tags: list[str]
    entity_refs: list[dict[str, str]]
    source_event_ids: list[str]
    source_urls: list[str]
    summary: str | None = None
    payload: dict[str, Any] | None = None
    last_recalled_at: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    observed_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MemoryItemResource:
        return cls(
            memory_id=data["memory_id"],
            org_id=data["org_id"],
            scope=MemoryScopeInfo.from_dict(data["scope"]),
            type=data.get("type", ""),
            kind=data.get("kind", ""),
            memory_kind=data.get("memory_kind", ""),
            status=data.get("status", ""),
            text=data.get("text", ""),
            confidence=data.get("confidence", 0.0),
            strength=data.get("strength", 0.0),
            recall_count=data.get("recall_count", 0),
            decay_half_life_days=data.get("decay_half_life_days", 0.0),
            pinned=data.get("pinned", False),
            tags=data.get("tags") or [],
            entity_refs=data.get("entity_refs") or [],
            source_event_ids=data.get("source_event_ids") or [],
            source_urls=data.get("source_urls") or [],
            summary=data.get("summary"),
            payload=data.get("payload"),
            last_recalled_at=data.get("last_recalled_at"),
            effective_from=data.get("effective_from"),
            effective_to=data.get("effective_to"),
            observed_at=data.get("observed_at"),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )


@dataclass
class MemoryListResponse:
    """Paginated list of memory items from the console memories API."""

    items: list[MemoryItemResource]
    total: int
    limit: int
    offset: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MemoryListResponse:
        return cls(
            items=[MemoryItemResource.from_dict(i) for i in data.get("items", [])],
            total=data["total"],
            limit=data["limit"],
            offset=data["offset"],
        )


@dataclass
class MemoryStatsResponse:
    """Aggregate statistics for all memories in an org."""

    total: int
    total_memories: int
    active_memories: int
    by_type: dict[str, int]
    by_kind: dict[str, int]
    by_status: dict[str, int]
    avg_confidence: float
    avg_strength: float
    top_entities: list[dict[str, Any]]
    confidence_buckets: list[dict[str, Any]] | None = None
    date_range: dict[str, str | None] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MemoryStatsResponse:
        return cls(
            total=data["total"],
            total_memories=data["total_memories"],
            active_memories=data["active_memories"],
            by_type=data.get("by_type") or {},
            by_kind=data.get("by_kind") or {},
            by_status=data.get("by_status") or {},
            avg_confidence=data["avg_confidence"],
            avg_strength=data["avg_strength"],
            top_entities=data.get("top_entities") or [],
            confidence_buckets=data.get("confidence_buckets"),
            date_range=data.get("date_range"),
        )


# ============== Control-Plane Models (api/) ==============


@dataclass
class MeResponse:
    """Identity information for the authenticated caller."""

    customer_id: str
    email: str
    tier: str
    is_superadmin: bool
    org_id: str
    is_billing_admin: bool
    user_id: str | None = None
    org_role: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MeResponse:
        return cls(
            customer_id=data["customer_id"],
            email=data["email"],
            tier=data["tier"],
            is_superadmin=data["is_superadmin"],
            org_id=data["org_id"],
            is_billing_admin=data["is_billing_admin"],
            user_id=data.get("user_id"),
            org_role=data.get("org_role"),
        )


@dataclass
class DimensionUsage:
    """Usage figures for a single billing dimension."""

    dimension: str
    used: int
    limit: int | None = None
    overage_rate: float | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DimensionUsage:
        return cls(
            dimension=data["dimension"],
            used=data["used"],
            limit=data.get("limit"),
            overage_rate=data.get("overage_rate"),
        )


@dataclass
class UsageSummaryResponse:
    """Summary of usage for the current billing period."""

    org_id: str
    tier: str
    period_start: str
    period_end: str
    dimensions: list[DimensionUsage]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> UsageSummaryResponse:
        return cls(
            org_id=data["org_id"],
            tier=data["tier"],
            period_start=data["period_start"],
            period_end=data["period_end"],
            dimensions=[DimensionUsage.from_dict(d) for d in data.get("dimensions", [])],
        )


@dataclass
class TimeseriesPoint:
    """A single data point in a usage timeseries."""

    date: str
    dimension: str
    quantity: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TimeseriesPoint:
        return cls(date=data["date"], dimension=data["dimension"], quantity=data["quantity"])


@dataclass
class UsageTimeseriesResponse:
    """Timeseries usage data for an org."""

    org_id: str
    granularity: str
    data: list[TimeseriesPoint]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> UsageTimeseriesResponse:
        return cls(
            org_id=data["org_id"],
            granularity=data["granularity"],
            data=[TimeseriesPoint.from_dict(p) for p in data.get("data", [])],
        )


@dataclass
class PaymentMethod:
    """A Stripe payment method summary."""

    brand: str
    last4: str
    exp_month: int
    exp_year: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PaymentMethod:
        return cls(
            brand=data["brand"],
            last4=data["last4"],
            exp_month=data["exp_month"],
            exp_year=data["exp_year"],
        )


@dataclass
class UpcomingInvoice:
    """Summary of the next Stripe invoice."""

    amount_due: int
    currency: str
    period_end: int  # Unix timestamp from Stripe

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> UpcomingInvoice:
        return cls(
            amount_due=data["amount_due"],
            currency=data["currency"],
            period_end=data["period_end"],
        )


@dataclass
class BillingSummary:
    """Billing summary for an org."""

    tier: str
    purchased_seats: int
    assigned_seats: int
    available_seats: int
    stripe_customer_id: str | None = None
    payment_method: PaymentMethod | None = None
    upcoming_invoice: UpcomingInvoice | None = None
    subscription_status: str | None = None
    billing_contact: str | None = None
    stripe_subscription_id: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BillingSummary:
        pm = data.get("payment_method")
        inv = data.get("upcoming_invoice")
        return cls(
            tier=data["tier"],
            purchased_seats=data["purchased_seats"],
            assigned_seats=data["assigned_seats"],
            available_seats=data["available_seats"],
            stripe_customer_id=data.get("stripe_customer_id"),
            payment_method=PaymentMethod.from_dict(pm) if pm else None,
            upcoming_invoice=UpcomingInvoice.from_dict(inv) if inv else None,
            subscription_status=data.get("subscription_status"),
            billing_contact=data.get("billing_contact"),
            stripe_subscription_id=data.get("stripe_subscription_id"),
        )


@dataclass
class Invoice:
    """A Stripe invoice record."""

    id: str
    amount_due: int
    amount_paid: int
    currency: str
    status: str
    created: str  # stringified Unix timestamp as returned by the API
    hosted_invoice_url: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Invoice:
        return cls(
            id=data["id"],
            amount_due=data["amount_due"],
            amount_paid=data["amount_paid"],
            currency=data["currency"],
            status=data["status"],
            created=data["created"],
            hosted_invoice_url=data.get("hosted_invoice_url"),
        )


@dataclass
class ApiKeyInfo:
    """Metadata for a single API key (raw key value is never returned after creation)."""

    key_id: str
    prefix: str
    name: str
    scopes: list[str]
    is_active: bool
    created_at: str
    last_used_at: str | None = None
    expires_at: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ApiKeyInfo:
        return cls(
            key_id=data["key_id"],
            prefix=data["prefix"],
            name=data["name"],
            scopes=data.get("scopes") or [],
            is_active=data["is_active"],
            created_at=data["created_at"],
            last_used_at=data.get("last_used_at"),
            expires_at=data.get("expires_at"),
        )


@dataclass
class ApiKeyListResponse:
    """List of API keys with tier quota info."""

    keys: list[ApiKeyInfo]
    max_keys: int
    active_count: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ApiKeyListResponse:
        return cls(
            keys=[ApiKeyInfo.from_dict(k) for k in data.get("keys", [])],
            max_keys=data["max_keys"],
            active_count=data["active_count"],
        )


@dataclass
class CreateKeyResponse:
    """Response from creating a new API key. Contains the raw key — store it securely."""

    key_id: str
    raw_key: str
    prefix: str
    name: str
    scopes: list[str]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CreateKeyResponse:
        return cls(
            key_id=data["key_id"],
            raw_key=data["raw_key"],
            prefix=data["prefix"],
            name=data["name"],
            scopes=data.get("scopes") or [],
        )


@dataclass
class EventItemResponse:
    """A single console event from the api/ control-plane."""

    event_id: str
    org_id: str
    actor_id: str
    kind: str
    content: str
    ts: str
    session_id: str | None = None
    metadata: dict[str, Any] | None = None
    ingested_at: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EventItemResponse:
        return cls(
            event_id=data["event_id"],
            org_id=data["org_id"],
            actor_id=data["actor_id"],
            kind=data["kind"],
            content=data["content"],
            ts=data["ts"],
            session_id=data.get("session_id"),
            metadata=data.get("metadata"),
            ingested_at=data.get("ingested_at"),
        )


@dataclass
class EventListResponse:
    """Paginated list of console events."""

    items: list[EventItemResponse]
    total: int
    limit: int
    offset: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EventListResponse:
        return cls(
            items=[EventItemResponse.from_dict(i) for i in data.get("items", [])],
            total=data["total"],
            limit=data["limit"],
            offset=data["offset"],
        )


@dataclass
class ProInterestResponse:
    """Response from expressing interest in the Pro plan."""

    message: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProInterestResponse:
        return cls(message=data["message"])
