"""Where a memory came from, as this SDK reports it.

Two header levels that must not collapse into one: X-Memsy-Client names the
library and is always true, X-Memsy-Surface names whatever sits on top and only
a wrapper sets it. memsy-core resolves surface-then-client, so the SAME SDK is
recorded as sdk/python-sdk in an application and as the wrapper inside one.
Send only one of them and that distinction is gone.

Asserted on the constructed httpx client's default headers rather than on a
mocked request, because that is where all four clients set them — and four
constructors quietly disagreeing is the failure these tests exist to catch.
"""

from __future__ import annotations

import pytest

from memsy import (
    AsyncMemsyClient,
    AsyncMemsyControlClient,
    EventPayload,
    MemsyClient,
    MemsyControlClient,
)

_ALL_CLIENTS = [MemsyClient, AsyncMemsyClient, MemsyControlClient, AsyncMemsyControlClient]


def _headers(cls, **kw) -> dict[str, str]:
    client = cls(base_url="https://test.memsy.io", api_key="test_key", **kw)
    return dict(client._client.headers)


def _event(**kw) -> EventPayload:
    return EventPayload(
        actor_id="a1", session_id="s1", kind="user_message", content="hello", **kw
    )


class TestClientHeader:
    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_every_client_identifies_the_library(self, cls):
        # The regression the shared default_headers() helper exists to prevent:
        # four constructors each built this dict independently, so a header
        # added to three of them would look done and silently mislabel the
        # fourth's traffic.
        assert _headers(cls)["x-memsy-client"] == "python-sdk"

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_authorization_survives(self, cls):
        # Guards the obvious regression in rebuilding this dict: dropping auth.
        assert _headers(cls)["authorization"] == "Bearer test_key"


class TestSurfaceHeader:
    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_absent_when_the_caller_is_the_application(self, cls):
        # ABSENT, not blank. Core reads an unparseable header as an affirmative
        # "unknown" finding about a real caller, while an absent one falls
        # through to the client header — which is how a plain integration lands
        # in sdk/python-sdk rather than in unknown/unknown.
        assert "x-memsy-surface" not in _headers(cls)

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_sent_when_a_wrapper_declares_itself(self, cls):
        headers = _headers(cls, surface="mcp")
        assert headers["x-memsy-surface"] == "mcp"
        # Both, not one: the client header stays true regardless.
        assert headers["x-memsy-client"] == "python-sdk"

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_an_empty_surface_is_treated_as_unset(self, cls):
        # surface="" is a caller mistake, not a claim. Sending it would stamp
        # the row unknown/unknown, which is strictly worse than falling back to
        # the client header.
        assert "x-memsy-surface" not in _headers(cls, surface="")


class TestEventPayload:
    def test_the_three_fields_serialise(self):
        d = _event(
            source_id="acme/handbook:deploys.md",
            source_author_email="priya@acme.com",
            source_author_id="U0A1b2C3",
        ).to_dict()
        assert d["source_id"] == "acme/handbook:deploys.md"
        assert d["source_author_email"] == "priya@acme.com"
        assert d["source_author_id"] == "U0A1b2C3"

    def test_omitted_entirely_when_unset(self):
        # A caller who sets none of these must produce a body identical to one
        # built before the fields existed — present-and-null is not the same as
        # absent to a server that distinguishes them.
        d = _event().to_dict()
        assert "source_id" not in d
        assert "source_author_email" not in d
        assert "source_author_id" not in d

    def test_request_level_fields_never_appear_in_the_body(self):
        # source_type and source are headers. A body field would be a second,
        # unclamped route to a value core only honours from one place, which is
        # what makes connector and studio provenance unforgeable.
        d = _event(source_id="x").to_dict()
        assert "source_type" not in d
        assert "source" not in d
        assert "source_instance_id" not in d
