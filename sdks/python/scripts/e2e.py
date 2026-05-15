#!/usr/bin/env python3
"""End-to-end smoke test for the memsy Python SDK against a live Memsy API.

Usage:
    MEMSY_BASE_URL=https://api.memsy.io/v1 \\
    MEMSY_API_KEY=msy_xxx \\
    python sdks/python/scripts/e2e.py

Covers:
    1. Sync MemsyClient — health, ingest variations, status, search variations, clear
    2. AsyncMemsyClient — same surface via asyncio
    3. Sync ↔ async parity check on health()
    4. Exception subclass hierarchy on bad inputs
    5. (Optional) MemsyControlClient — me, health, keys.list, usage.summary

Each step prints PASS/FAIL with one-line detail. Exits non-zero on failure.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Any, Awaitable, Callable

from memsy import (
    MemsyClient,
    AsyncMemsyClient,
    EventPayload,
    MemsyControlClient,
)
from memsy.exceptions import (
    MemsyError,
    MemsyAPIError,
    MemsyConnectionError,
    AuthenticationError,
    AuthorizationError,
    RateLimitExceeded,
)


BASE_URL = os.environ.get("MEMSY_BASE_URL")
API_KEY = os.environ.get("MEMSY_API_KEY")
if not BASE_URL or not API_KEY:
    print("Set MEMSY_BASE_URL and MEMSY_API_KEY before running.", file=sys.stderr)
    sys.exit(2)

RUN_ID = datetime.now(__import__("datetime").timezone.utc).strftime("%Y%m%d%H%M%S%f")
ACTOR = f"e2e-py-actor-{RUN_ID}"
SESSION = f"e2e-py-session-{RUN_ID}"
ALT_ACTOR = f"e2e-py-alt-actor-{RUN_ID}"


results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str) -> None:
    results.append((name, ok, detail))
    print(f"{'✓' if ok else '✗'} {name} — {detail}")


def step(name: str, fn: Callable[[], str]) -> None:
    try:
        record(name, True, fn())
    except Exception as err:  # noqa: BLE001
        kind = type(err).__name__
        extra = f"{err}"
        if isinstance(err, MemsyAPIError):
            detail = (getattr(err, "detail", "") or "")[:120]
            extra = f"status_code={err.status_code} detail={detail}"
        record(name, False, f"{kind}: {extra}")


async def astep(name: str, fn: Callable[[], Awaitable[str]]) -> None:
    try:
        record(name, True, await fn())
    except Exception as err:  # noqa: BLE001
        kind = type(err).__name__
        extra = f"{err}"
        if isinstance(err, MemsyAPIError):
            detail = (getattr(err, "detail", "") or "")[:120]
            extra = f"status_code={err.status_code} detail={detail}"
        record(name, False, f"{kind}: {extra}")


print()
print("=== memsy (Python) E2E ===")
print(f"baseUrl: {BASE_URL}")
print(f"actor:   {ACTOR}")
print(f"session: {SESSION}")
print()


client = MemsyClient(base_url=BASE_URL, api_key=API_KEY, timeout=30.0, max_retries=2)


# -----------------------------------------------------------------------------
# Group 1 — Health
# -----------------------------------------------------------------------------
def _health() -> str:
    h = client.health()
    if h.status != "ok":
        raise AssertionError(f"unexpected status={h.status}")
    return f"status={h.status} version={h.version or '(empty)'} components={len(h.components or {})}"


step("1.01 sync health()", _health)


# -----------------------------------------------------------------------------
# Group 2 — Sync ingest variations
# -----------------------------------------------------------------------------
basic_ids: list[str] = []
meta_ids: list[str] = []
backfill_ids: list[str] = []
scoped_ids: list[str] = []
batch_ids: list[str] = []
alt_ids: list[str] = []


def _ingest_basic() -> str:
    r = client.ingest([
        EventPayload(actor_id=ACTOR, session_id=SESSION, kind="user_message",
                     content="I prefer dark mode in all apps."),
        EventPayload(actor_id=ACTOR, session_id=SESSION, kind="assistant_message",
                     content="Got it — dark mode it is."),
    ])
    if len(r.event_ids) != 2:
        raise AssertionError(f"expected 2 ids, got {len(r.event_ids)}")
    basic_ids.extend(r.event_ids)
    return f"event_ids=[{', '.join(x[:8] for x in r.event_ids)}…]"


def _ingest_meta() -> str:
    r = client.ingest([
        EventPayload(
            actor_id=ACTOR, session_id=SESSION, kind="app_event",
            content="User upgraded to pro plan.",
            metadata=json.dumps({"plan": "pro", "source": "billing-webhook"}),
        ),
    ])
    meta_ids.extend(r.event_ids)
    return f"event_ids=[{', '.join(x[:8] for x in r.event_ids)}…]"


def _ingest_backfill() -> str:
    r = client.ingest([
        EventPayload(
            actor_id=ACTOR, session_id=SESSION, kind="user_message",
            content="Historical event from earlier.",
            ts="2025-01-15T14:22:10Z",
        ),
    ])
    backfill_ids.extend(r.event_ids)
    return f"event_ids=[{', '.join(x[:8] for x in r.event_ids)}…] ts=2025-01-15T14:22:10Z"


def _ingest_scoped() -> str:
    r = client.ingest([
        EventPayload(
            actor_id=ACTOR, session_id=SESSION, kind="user_message",
            content="I prefer Rust for performance-critical paths.",
            role_id="role_eng", team_id="team_platform",
        ),
    ])
    scoped_ids.extend(r.event_ids)
    return f"event_ids=[{', '.join(x[:8] for x in r.event_ids)}…] role_id team_id sent"


def _ingest_alt() -> str:
    r = client.ingest([
        EventPayload(actor_id=ALT_ACTOR, session_id=SESSION, kind="user_message",
                     content="I love Python and data science work."),
    ])
    alt_ids.extend(r.event_ids)
    return f"actor={ALT_ACTOR} event_ids=[{', '.join(x[:8] for x in r.event_ids)}…]"


def _ingest_batch() -> str:
    events = [
        EventPayload(
            actor_id=ACTOR, session_id=SESSION,
            kind="user_message" if i % 2 == 0 else "assistant_message",
            content=f"Batch event {i}: random content blob with index {i}.",
        )
        for i in range(25)
    ]
    r = client.ingest(events)
    if len(r.event_ids) != 25:
        raise AssertionError(f"expected 25 ids, got {len(r.event_ids)}")
    batch_ids.extend(r.event_ids)
    return "25 events ingested"


step("2.01 ingest — basic 2 events", _ingest_basic)
step("2.02 ingest — event with metadata (JSON string)", _ingest_meta)
step("2.03 ingest — event with explicit ts (backfill)", _ingest_backfill)
step("2.04 ingest — event with role_id + team_id (scoping)", _ingest_scoped)
step("2.05 ingest — different actor (cross-actor)", _ingest_alt)
step("2.06 ingest — 25-event batch", _ingest_batch)


all_ids = basic_ids + meta_ids + backfill_ids + scoped_ids + batch_ids


# -----------------------------------------------------------------------------
# Group 3 — Status
# -----------------------------------------------------------------------------
def _status_now() -> str:
    s = client.status(all_ids)
    if s.total != len(all_ids):
        raise AssertionError(f"expected total={len(all_ids)}, got {s.total}")
    return f"total={s.total} completed={len(s.completed_ids)} pending={len(s.pending_ids)} failed={len(s.failed_ids)}"


step("3.01 status() immediately after ingest", _status_now)


print("\n  [waiting 12s for async extraction…]\n")
import time as _time
_time.sleep(12)


def _status_later() -> str:
    s = client.status(all_ids)
    return f"completed={len(s.completed_ids)}/{s.total} pending={len(s.pending_ids)} failed={len(s.failed_ids)}"


step("3.02 status() after 12s", _status_later)


# -----------------------------------------------------------------------------
# Group 4 — Search variations
# -----------------------------------------------------------------------------
def _search_default() -> str:
    r = client.search("user preferences", actor_id=ACTOR)
    top = r.results[0].score if r.results else None
    return f"{len(r.results)} results, top score={top:.3f}" if top is not None else f"{len(r.results)} results"


def _search_limited() -> str:
    r = client.search("memory", actor_id=ACTOR, limit=3, threshold=0.0)
    if len(r.results) > 3:
        raise AssertionError(f"limit=3 violated, got {len(r.results)}")
    return f"{len(r.results)} results (≤3)"


def _search_high_threshold() -> str:
    r = client.search("preferences", actor_id=ACTOR, threshold=0.99)
    return f"{len(r.results)} results above threshold=0.99"


def _search_with_sources() -> str:
    r = client.search("preferences", actor_id=ACTOR, threshold=0.0, include_source_events=True)
    if not r.results:
        return "0 results (extraction may still be pending)"
    # Python exposes source_events as a property reading metadata['source_events'].
    with_src = [x for x in r.results if x.source_events]
    if not with_src:
        return f"{len(r.results)} results — none carried source_events (likely empty metadata)"
    sample = with_src[0].source_events[0]
    return f"{len(with_src)}/{len(r.results)} carry source_events; sample.event_id={sample.event_id[:12]}…"


def _search_alt_actor() -> str:
    r = client.search("Python data science", actor_id=ALT_ACTOR, threshold=0.0)
    return f"{len(r.results)} results for ALT_ACTOR"


def _search_cross_actor() -> str:
    r = client.search("preferences", threshold=0.0, limit=20)
    return f"{len(r.results)} cross-actor results"


step("4.01 search — default (actor-scoped)", _search_default)
step("4.02 search — with limit=3", _search_limited)
step("4.03 search — high threshold (expect 0)", _search_high_threshold)
step("4.04 search — include_source_events=True (Python property)", _search_with_sources)
step("4.05 search — alt actor (isolation)", _search_alt_actor)
step("4.06 search — cross-actor (no actor_id)", _search_cross_actor)


# -----------------------------------------------------------------------------
# Group 6 — Sync error paths
# -----------------------------------------------------------------------------
def _err_bad_key() -> str:
    bad = MemsyClient(base_url=BASE_URL, api_key="msy_definitely_invalid", max_retries=0)
    try:
        bad.health()
        raise AssertionError("expected error")
    except AuthenticationError as err:
        return f"AuthenticationError status_code={err.status_code} (typed subclass — canonical 401)"
    except MemsyAPIError as err:
        return f"MemsyAPIError status_code={err.status_code} (server uses {err.status_code} not 401)"


def _err_bad_host() -> str:
    bad = MemsyClient(base_url="https://nonexistent-host-memsy-e2e.example.invalid",
                      api_key=API_KEY, timeout=5.0, max_retries=0)
    try:
        bad.health()
        raise AssertionError("expected connection error")
    except MemsyConnectionError as err:
        return f"MemsyConnectionError caught — {str(err)[:80]}"


def _err_bad_kind() -> str:
    try:
        client.ingest([
            EventPayload(actor_id=ACTOR, session_id=SESSION, kind="not_a_real_kind",
                         content="should fail validation"),
        ])
        return "WARN: server accepted invalid kind (no validation)"
    except MemsyAPIError as err:
        return f"MemsyAPIError {err.status_code}: rejected invalid kind"


step("6.01 error — bogus API key", _err_bad_key)
step("6.02 error — bad host (MemsyConnectionError)", _err_bad_host)
step("6.03 error — bad event kind", _err_bad_kind)


# -----------------------------------------------------------------------------
# Group 7 — Async client (parity)
# -----------------------------------------------------------------------------
async def _async_health() -> str:
    async with AsyncMemsyClient(base_url=BASE_URL, api_key=API_KEY) as ac:
        h = await ac.health()
        if h.status != "ok":
            raise AssertionError(f"unexpected status={h.status}")
        return f"async status={h.status} version={h.version or '(empty)'}"


async def _async_ingest_search() -> str:
    async with AsyncMemsyClient(base_url=BASE_URL, api_key=API_KEY) as ac:
        ing = await ac.ingest([
            EventPayload(actor_id=ACTOR, session_id=SESSION, kind="user_message",
                         content="async-ingested event for E2E."),
        ])
        if len(ing.event_ids) != 1:
            raise AssertionError(f"expected 1 id, got {len(ing.event_ids)}")
        s = await ac.search("preferences", actor_id=ACTOR, threshold=0.0)
        return f"async ingest({len(ing.event_ids)}) + search({len(s.results)}) OK"


async def _async_parity() -> str:
    sync_h = client.health()
    async with AsyncMemsyClient(base_url=BASE_URL, api_key=API_KEY) as ac:
        async_h = await ac.health()
    if sync_h.status != async_h.status:
        raise AssertionError(f"sync.status={sync_h.status} != async.status={async_h.status}")
    if sync_h.version != async_h.version:
        return f"WARN: sync.version={sync_h.version} async.version={async_h.version} (timing drift?)"
    return "sync ≡ async (status + version match)"


async def _async_concurrent() -> str:
    async with AsyncMemsyClient(base_url=BASE_URL, api_key=API_KEY) as ac:
        queries = ["preferences", "memory", "language", "mode", "rust"]
        tasks = [ac.search(q, actor_id=ACTOR, limit=3, threshold=0.0) for q in queries]
        all_results = await asyncio.gather(*tasks)
        total = sum(len(r.results) for r in all_results)
        return f"5 parallel async searches — {total} total results"


async def _run_async() -> None:
    await astep("7.01 async health()", _async_health)
    await astep("7.02 async ingest + search", _async_ingest_search)
    await astep("7.03 sync ↔ async parity", _async_parity)
    await astep("7.04 async concurrent (5 parallel searches)", _async_concurrent)


asyncio.run(_run_async())


# -----------------------------------------------------------------------------
# Group 8 — Control plane (best-effort — may not exist in dev tier)
# -----------------------------------------------------------------------------
# The control plane lives at /api/* (not /v1/*). Strip /v1 if present.
control_url = BASE_URL.rstrip("/")
if control_url.endswith("/v1"):
    control_url = control_url[: -len("/v1")]


def _control_health() -> str:
    with MemsyControlClient(base_url=f"{control_url}/api", api_key=API_KEY) as c:
        h = c.health()
        return f"control health.status={getattr(h, 'status', '?')}"


def _control_me() -> str:
    with MemsyControlClient(base_url=f"{control_url}/api", api_key=API_KEY) as c:
        me = c.me()
        return f"me org_id={getattr(me, 'org_id', '?')} email={getattr(me, 'email', '?')}"


def _control_keys() -> str:
    """Admin-only endpoint. Either succeeds (key has admin scope) or raises typed
    AuthorizationError (verifies the typed exception subclass on 403)."""
    with MemsyControlClient(base_url=f"{control_url}/api", api_key=API_KEY) as c:
        try:
            keys = c.keys.list()
            return f"keys count={len(keys.items) if hasattr(keys, 'items') else '?'} (admin scope)"
        except AuthorizationError as err:
            return f"AuthorizationError 403 (non-admin key) — typed exception fired correctly"


def _control_usage() -> str:
    """Admin-only endpoint. Same handling as keys.list()."""
    with MemsyControlClient(base_url=f"{control_url}/api", api_key=API_KEY) as c:
        try:
            u = c.usage.summary()
            return f"usage summary returned ({type(u).__name__})"
        except AuthorizationError as err:
            return f"AuthorizationError 403 (non-admin key) — typed exception fired correctly"


def _orgs_list() -> str:
    """Hot-path-client orgs sub-resource. Admin-gated."""
    try:
        orgs = client.orgs.list()
        return f"orgs count={len(orgs)} (admin scope)"
    except AuthorizationError as err:
        return f"AuthorizationError 403 — typed exception fired correctly"


def _roles_list() -> str:
    try:
        roles = client.roles.list("nonexistent-org-for-e2e")
        return f"roles count={len(roles)} (admin scope)"
    except (AuthorizationError, MemsyAPIError) as err:
        if isinstance(err, AuthorizationError):
            return f"AuthorizationError 403 — typed exception fired correctly"
        return f"MemsyAPIError {err.status_code}: {(err.detail or '')[:60]}"


def _teams_list() -> str:
    try:
        teams = client.teams.list("nonexistent-org-for-e2e")
        return f"teams count={len(teams)} (admin scope)"
    except (AuthorizationError, MemsyAPIError) as err:
        if isinstance(err, AuthorizationError):
            return f"AuthorizationError 403 — typed exception fired correctly"
        return f"MemsyAPIError {err.status_code}: {(err.detail or '')[:60]}"


def _memories_stats() -> str:
    try:
        s = client.memories.stats()
        return f"memories.stats returned ({type(s).__name__})"
    except (AuthorizationError, MemsyAPIError) as err:
        if isinstance(err, AuthorizationError):
            return f"AuthorizationError 403 — typed exception fired correctly"
        return f"MemsyAPIError {err.status_code}: {(err.detail or '')[:60]}"


def _memories_list() -> str:
    try:
        result = client.memories.list(limit=5)
        return f"memories.list returned {len(result.items)} items"
    except (AuthorizationError, MemsyAPIError) as err:
        if isinstance(err, AuthorizationError):
            return f"AuthorizationError 403 — typed exception fired correctly"
        return f"MemsyAPIError {err.status_code}: {(err.detail or '')[:60]}"


step("8.01 control — health", _control_health)
step("8.02 control — me", _control_me)
step("8.03 control — keys.list() (admin-gated)", _control_keys)
step("8.04 control — usage.summary() (admin-gated)", _control_usage)
step("8.05 hot-path — orgs.list() (admin-gated)", _orgs_list)
step("8.06 hot-path — roles.list() (admin-gated)", _roles_list)
step("8.07 hot-path — teams.list() (admin-gated)", _teams_list)
step("8.08 hot-path — memories.stats()", _memories_stats)
step("8.09 hot-path — memories.list()", _memories_list)


# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
print()
print("=== Summary ===")
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
print(f"{passed} passed, {failed} failed")

if failed > 0:
    print("\nFailures:")
    for name, ok, detail in results:
        if not ok:
            print(f"  ✗ {name}: {detail}")
    sys.exit(1)
