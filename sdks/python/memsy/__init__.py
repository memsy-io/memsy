"""
Memsy Python SDK — official client for the Memsy memory service.

Quick start (hot-path memory)::

    from memsy import MemsyClient, EventPayload

    client = MemsyClient(base_url="https://your-memsy-core-url", api_key="msy_...")
    health = client.health()

    # Ingest events
    result = client.ingest([
        EventPayload(actor_id="user_1", session_id="sess_1",
                     kind="user_message", content="I prefer dark mode",
                     role_id="role_eng", team_id="team_platform")
    ])

    # Search memories
    results = client.search("user preferences", include_source_events=True)

    # Onboarding / hierarchy
    client.orgs.create(org_id="my-org", name="My Org", focus="...")
    client.roles.list(org_id="my-org")
    client.memories.stats()

Control-plane (billing, keys, usage, events)::

    from memsy import MemsyControlClient

    control = MemsyControlClient(base_url="https://your-api-url", api_key="msy_...")
    me = control.me()
    events = control.events.list(limit=20)

Async usage::

    from memsy import AsyncMemsyClient, AsyncMemsyControlClient, EventPayload

    async with AsyncMemsyClient(base_url="...", api_key="msy_...") as client:
        health = await client.health()
"""

from memsy.async_client import AsyncMemsyClient
from memsy.async_control import AsyncMemsyControlClient
from memsy.client import MemsyClient
from memsy.control import MemsyControlClient
from memsy.exceptions import (
    AuthenticationError,
    AuthorizationError,
    BillingNotEnabledError,
    FeatureNotAvailable,
    KeyLimitReachedError,
    MemsyAPIError,
    MemsyConnectionError,
    MemsyError,
    OrgIdNotAllowedError,
    OrgLimitReachedError,
    RateLimitExceeded,
    SeatLimitReachedError,
    SeatRequiredError,
    UsageLimitExceeded,
)
from memsy.models import (
    # Control-plane models
    ApiKeyInfo,
    ApiKeyListResponse,
    BillingSummary,
    ClearResponse,
    CreateKeyResponse,
    DimensionUsage,
    EventItemResponse,
    EventListResponse,
    # Core models
    EventPayload,
    HealthResponse,
    IngestResponse,
    Invoice,
    # Console memory models
    MemoryItemResource,
    MemoryListResponse,
    MemoryScopeInfo,
    MemoryStatsResponse,
    MeResponse,
    # Onboarding models
    OrgResource,
    PaymentMethod,
    ProInterestResponse,
    RateLimitInfo,
    RoleResource,
    SearchResponse,
    SearchResult,
    SourceEvent,
    StatusResponse,
    TeamResource,
    TimeseriesPoint,
    UpcomingInvoice,
    UsageInfo,
    UsageSummaryResponse,
    UsageTimeseriesResponse,
)

__all__ = [
    # Clients
    "MemsyClient",
    "AsyncMemsyClient",
    "MemsyControlClient",
    "AsyncMemsyControlClient",
    # Core request models
    "EventPayload",
    "SourceEvent",
    # Core response models
    "IngestResponse",
    "SearchResponse",
    "SearchResult",
    "StatusResponse",
    "HealthResponse",
    "ClearResponse",
    # Onboarding models
    "OrgResource",
    "RoleResource",
    "TeamResource",
    # Console memory models
    "MemoryScopeInfo",
    "MemoryItemResource",
    "MemoryListResponse",
    "MemoryStatsResponse",
    # Control-plane models
    "MeResponse",
    "DimensionUsage",
    "UsageSummaryResponse",
    "TimeseriesPoint",
    "UsageTimeseriesResponse",
    "PaymentMethod",
    "UpcomingInvoice",
    "BillingSummary",
    "Invoice",
    "ApiKeyInfo",
    "ApiKeyListResponse",
    "CreateKeyResponse",
    "EventItemResponse",
    "EventListResponse",
    "ProInterestResponse",
    # Usage & Rate Limit
    "UsageInfo",
    "RateLimitInfo",
    # Exceptions
    "MemsyError",
    "MemsyConnectionError",
    "MemsyAPIError",
    "AuthenticationError",
    "AuthorizationError",
    "FeatureNotAvailable",
    "OrgIdNotAllowedError",
    "SeatRequiredError",
    "OrgLimitReachedError",
    "KeyLimitReachedError",
    "BillingNotEnabledError",
    "SeatLimitReachedError",
    "RateLimitExceeded",
    "UsageLimitExceeded",
]
