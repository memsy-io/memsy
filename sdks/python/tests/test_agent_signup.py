"""Tests for agent self-signup (memsy.agent) and the `memsy agent signup` CLI.

The api and AgentMail are faked with httpx.MockTransport; the Playwright step is
replaced by a fake that plays the AgentID redirect, so no browser or network is used.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import sys

import httpx
import pytest

from memsy import agent, cli
from memsy.agent import (
    AgentCredentials,
    AgentSignupError,
    agent_signup,
    async_agent_signup,
)
from memsy.exceptions import RateLimitExceeded

ROOT = "https://api.example.test"
AUTHORIZE_URL = "https://auth.agentid.com/v0/authorize?client_id=c&state=s"
TOKEN = "tok_abc123"


def _session_meta(**overrides) -> str:
    action = {
        "type": "agentid_session_required",
        "issuer": "https://auth.agentid.com",
        "auth_token": TOKEN,
        "accept_disclosure": True,
        **overrides,
    }
    return json.dumps(action)


class FakeApi:
    """The Memsy signup endpoints plus AgentMail's authorize endpoint."""

    def __init__(self, polls: list[tuple[int, dict]] | None = None, start=None):
        self.start = start or (
            201,
            {
                "signup_id": "sid1",
                "poll_secret": "ps1",
                "authorize_url": AUTHORIZE_URL,
                "expires_in": 600,
            },
        )
        self.polls = polls or [
            (200, {"status": "pending"}),
            (
                200,
                {
                    "status": "complete",
                    "api_key": "msy_secretvalue123",
                    "key_id": "k1",
                    "org_id": "org_1",
                    "user_id": "user_1",
                },
            ),
        ]
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if url == f"{ROOT}/api/agents/signup" and request.method == "POST":
            return httpx.Response(self.start[0], json=self.start[1])
        if url == f"{ROOT}/api/agents/signup/sid1":
            assert request.headers["Authorization"] == "Bearer ps1"
            status, body = self.polls.pop(0) if len(self.polls) > 1 else self.polls[0]
            return httpx.Response(status, json=body)
        if url.startswith("https://api.agentmail.to/v0/inboxes/"):
            return httpx.Response(202, json={})
        return httpx.Response(599, json={"unexpected": url})


@pytest.fixture
def fake(monkeypatch):
    api = FakeApi()
    monkeypatch.setattr(
        agent, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(api.handler))
    )
    monkeypatch.setattr(agent, "_POLL_INTERVAL", 0)
    approvals: list[str] = []

    @contextlib.asynccontextmanager
    async def fake_browser(authorize_url, inbox_id, agentmail_api_key, http, timeout):
        approvals.append(authorize_url)
        yield

    monkeypatch.setattr(agent, "_browser_approval", fake_browser)
    api.approvals = approvals
    return api


# ── happy path ────────────────────────────────────────────────────────────────


async def test_async_signup_returns_credentials_ready_for_the_clients(fake):
    creds = await async_agent_signup(ROOT, "agent@example.test", "am_key", org_name="Bot Co")

    assert creds == AgentCredentials(
        base_url=f"{ROOT}/v1",
        control_url=f"{ROOT}/api",
        api_key="msy_secretvalue123",
        key_id="k1",
        org_id="org_1",
        user_id="user_1",
    )
    assert fake.approvals == [AUTHORIZE_URL]
    start = fake.requests[0]
    assert json.loads(start.content) == {"org_name": "Bot Co"}


def test_sync_signup_wraps_the_async_flow(fake):
    creds = agent_signup(ROOT, "agent@example.test", "am_key")
    assert creds.api_key == "msy_secretvalue123"


def test_credentials_repr_hides_the_key(fake):
    creds = agent_signup(ROOT, "agent@example.test", "am_key")
    assert "msy_secretvalue123" not in repr(creds)
    assert "msy_secretvalue123" not in str(creds)


@pytest.mark.parametrize("given", [ROOT, f"{ROOT}/", f"{ROOT}/v1", f"{ROOT}/api/"])
async def test_base_url_accepts_root_or_client_urls(fake, given):
    creds = await async_agent_signup(given, "agent@example.test", "am_key")
    assert str(fake.requests[0].url) == f"{ROOT}/api/agents/signup"
    assert creds.base_url == f"{ROOT}/v1"


# ── failures ─────────────────────────────────────────────────────────────────


async def test_signup_not_enabled_is_explained(fake):
    fake.start = (404, {"detail": "agent_signup_not_enabled"})
    with pytest.raises(AgentSignupError, match="not enabled"):
        await async_agent_signup(ROOT, "agent@example.test", "am_key")
    assert fake.approvals == []


async def test_start_rate_limit_raises_typed_error(fake):
    fake.start = (429, {"detail": "too_many_signup_attempts"})
    with pytest.raises(RateLimitExceeded):
        await async_agent_signup(ROOT, "agent@example.test", "am_key")


async def test_authorize_url_off_agentid_is_refused_before_any_browser(fake):
    fake.start = (
        201,
        {
            "signup_id": "sid1",
            "poll_secret": "ps1",
            "authorize_url": "https://evil.example/v0/authorize",
            "expires_in": 600,
        },
    )
    with pytest.raises(AgentSignupError, match="auth.agentid.com"):
        await async_agent_signup(ROOT, "agent@example.test", "am_key")
    assert fake.approvals == []


async def test_poll_error_status_surfaces_the_reason(fake):
    fake.polls = [(200, {"status": "error", "error": "owner_signup_limit"})]
    with pytest.raises(AgentSignupError, match="owner_signup_limit"):
        await async_agent_signup(ROOT, "agent@example.test", "am_key")


async def test_key_already_issued_tells_caller_to_restart(fake):
    fake.polls = [(410, {"detail": "api_key_already_issued"})]
    with pytest.raises(AgentSignupError, match="new signup"):
        await async_agent_signup(ROOT, "agent@example.test", "am_key")


async def test_pending_forever_times_out(fake):
    fake.polls = [(200, {"status": "pending"})]
    with pytest.raises(AgentSignupError, match="timed out"):
        await async_agent_signup(ROOT, "agent@example.test", "am_key", timeout=0.05)


async def test_sync_wrapper_refuses_to_run_inside_an_event_loop():
    with pytest.raises(AgentSignupError, match="async_agent_signup"):
        agent_signup(ROOT, "agent@example.test", "am_key")


def test_missing_playwright_points_to_the_extra(monkeypatch):
    monkeypatch.setitem(sys.modules, "playwright.async_api", None)

    async def run():
        async with httpx.AsyncClient() as http:
            async with agent._browser_approval(AUTHORIZE_URL, "i", "k", http, 1.0):
                pass

    with pytest.raises(AgentSignupError, match=r"memsy\[agent\]"):
        asyncio.run(run())


# ── the AgentID wait page contract ───────────────────────────────────────────


def test_session_action_yields_the_auth_token():
    page = "https://auth.agentid.com/v0/authorize/wait?jti=x"
    assert agent._auth_token_from_session_action(page, _session_meta()) == TOKEN


@pytest.mark.parametrize(
    "page_url, meta",
    [
        ("https://evil.example/v0/authorize/wait", _session_meta()),
        ("https://auth.agentid.com/wait", _session_meta(type="something_else")),
        ("https://auth.agentid.com/wait", _session_meta(issuer="https://evil.example")),
        ("https://auth.agentid.com/wait", _session_meta(auth_token="")),
        ("https://auth.agentid.com/wait", "not json"),
    ],
)
def test_session_action_rejects_anything_unexpected(page_url, meta):
    with pytest.raises(AgentSignupError):
        agent._auth_token_from_session_action(page_url, meta)


async def test_agentmail_approval_sends_the_key_only_to_agentmail():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(202, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await agent._agentmail_approve(http, "bot@inbox.test", "am_key", TOKEN)

    (req,) = seen
    assert str(req.url) == "https://api.agentmail.to/v0/inboxes/bot%40inbox.test/authorize"
    assert req.headers["Authorization"] == "Bearer am_key"
    assert json.loads(req.content) == {"auth_token": TOKEN, "accept_disclosure": True}


async def test_agentmail_rejection_is_reported():
    def handler(request):
        return httpx.Response(403, json={"message": "inbox not allowed"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(AgentSignupError, match="403"):
            await agent._agentmail_approve(http, "bot@inbox.test", "am_key", TOKEN)


# ── CLI ──────────────────────────────────────────────────────────────────────


def test_cli_prints_shell_exports_and_keeps_the_key_off_stderr(monkeypatch, capsys):
    monkeypatch.setenv("AGENTMAIL_API_KEY", "am_key")
    calls = {}

    def fake_signup(base_url, inbox_id, agentmail_api_key, *, org_name=None):
        calls.update(base_url=base_url, inbox_id=inbox_id, key=agentmail_api_key, org=org_name)
        return AgentCredentials(
            base_url=f"{ROOT}/v1",
            control_url=f"{ROOT}/api",
            api_key="msy_secretvalue123",
            key_id="k1",
            org_id="org_1",
            user_id="user_1",
        )

    monkeypatch.setattr(cli, "agent_signup", fake_signup)
    code = cli.main(["agent", "signup", "--inbox", "bot@inbox.test", "--base-url", ROOT])

    out, err = capsys.readouterr()
    assert code == 0
    assert calls == {"base_url": ROOT, "inbox_id": "bot@inbox.test", "key": "am_key", "org": None}
    assert f"export MEMSY_BASE_URL={ROOT}/v1" in out
    assert "export MEMSY_API_KEY=msy_secretvalue123" in out
    assert "msy_secretvalue123" not in err
    assert "org_1" in err


def test_cli_requires_agentmail_key_from_env(monkeypatch, capsys):
    monkeypatch.delenv("AGENTMAIL_API_KEY", raising=False)
    code = cli.main(["agent", "signup", "--inbox", "bot@inbox.test", "--base-url", ROOT])
    assert code == 2
    assert "AGENTMAIL_API_KEY" in capsys.readouterr().err


def test_cli_reports_signup_failures_without_a_traceback(monkeypatch, capsys):
    monkeypatch.setenv("AGENTMAIL_API_KEY", "am_key")

    def failing(*args, **kwargs):
        raise AgentSignupError("Agent signup is not enabled on this Memsy deployment.")

    monkeypatch.setattr(cli, "agent_signup", failing)
    code = cli.main(["agent", "signup", "--inbox", "bot@inbox.test", "--base-url", ROOT])
    assert code == 1
    assert "not enabled" in capsys.readouterr().err
