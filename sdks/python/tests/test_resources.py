"""Tests for MemsyClient sub-resources: orgs, roles, teams, memories, actors."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from memsy import MemsyClient


def _make_response(status_code: int, body: object, headers: dict | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json.return_value = body
    resp.headers = headers or {}
    resp.content = b"x"
    return resp


ORG_DICT = {
    "org_id": "org_1",
    "name": "My Org",
    "focus": "AI assistant context",
    "promotion_prompt": "Focus on...",
    "created_at": "2026-04-01T00:00:00Z",
    "updated_at": "2026-04-01T00:00:00Z",
}

ROLE_DICT = {
    "role_id": "role_1",
    "org_id": "org_1",
    "name": "Engineering",
    "focus": "Software engineers",
    "promotion_prompt": "For engineers...",
    "created_at": "2026-04-01T00:00:00Z",
    "updated_at": "2026-04-01T00:00:00Z",
}

TEAM_DICT = {
    "team_id": "team_1",
    "org_id": "org_1",
    "name": "Platform",
    "focus": "Infrastructure team",
    "promotion_prompt": "Platform team...",
    "created_at": "2026-04-01T00:00:00Z",
    "updated_at": "2026-04-01T00:00:00Z",
}


@pytest.fixture
def client():
    return MemsyClient(base_url="https://test.memsy.io", api_key="test_key")


class TestOrgsResource:
    @patch("httpx.Client.request")
    def test_orgs_list(self, mock_request, client):
        mock_request.return_value = _make_response(200, [ORG_DICT])
        orgs = client.orgs.list()
        assert len(orgs) == 1
        assert orgs[0].org_id == "org_1"
        assert orgs[0].name == "My Org"

    @patch("httpx.Client.request")
    def test_orgs_create(self, mock_request, client):
        mock_request.return_value = _make_response(200, ORG_DICT)
        org = client.orgs.create(org_id="org_1", name="My Org", focus="AI assistant context")
        assert org.org_id == "org_1"
        assert org.focus == "AI assistant context"

    @patch("httpx.Client.request")
    def test_orgs_get(self, mock_request, client):
        mock_request.return_value = _make_response(200, ORG_DICT)
        org = client.orgs.get("org_1")
        assert org.org_id == "org_1"

    @patch("httpx.Client.request")
    def test_orgs_update(self, mock_request, client):
        updated = {**ORG_DICT, "focus": "Updated focus"}
        mock_request.return_value = _make_response(200, updated)
        org = client.orgs.update("org_1", focus="Updated focus")
        assert org.focus == "Updated focus"

    @patch("httpx.Client.request")
    def test_orgs_regenerate_prompt(self, mock_request, client):
        updated = {**ORG_DICT, "promotion_prompt": "New prompt"}
        mock_request.return_value = _make_response(200, updated)
        org = client.orgs.regenerate_prompt("org_1")
        assert org.promotion_prompt == "New prompt"

    @patch("httpx.Client.request")
    def test_orgs_delete_204(self, mock_request, client):
        resp = _make_response(204, {})
        resp.content = b""
        resp.is_success = True
        mock_request.return_value = resp
        # Should not raise
        client.orgs.delete("org_1")


class TestRolesResource:
    @patch("httpx.Client.request")
    def test_roles_list(self, mock_request, client):
        mock_request.return_value = _make_response(200, [ROLE_DICT])
        roles = client.roles.list(org_id="org_1")
        assert len(roles) == 1
        assert roles[0].role_id == "role_1"

    @patch("httpx.Client.request")
    def test_roles_create(self, mock_request, client):
        mock_request.return_value = _make_response(200, ROLE_DICT)
        role = client.roles.create(org_id="org_1", name="Engineering", focus="Software engineers")
        assert role.role_id == "role_1"
        assert role.org_id == "org_1"

    @patch("httpx.Client.request")
    def test_roles_get(self, mock_request, client):
        mock_request.return_value = _make_response(200, ROLE_DICT)
        role = client.roles.get(role_id="role_1", org_id="org_1")
        assert role.role_id == "role_1"

    @patch("httpx.Client.request")
    def test_roles_update(self, mock_request, client):
        updated = {**ROLE_DICT, "name": "Senior Engineering"}
        mock_request.return_value = _make_response(200, updated)
        role = client.roles.update("role_1", "org_1", name="Senior Engineering")
        assert role.name == "Senior Engineering"

    @patch("httpx.Client.request")
    def test_roles_regenerate_prompt(self, mock_request, client):
        updated = {**ROLE_DICT, "promotion_prompt": "New role prompt"}
        mock_request.return_value = _make_response(200, updated)
        role = client.roles.regenerate_prompt("role_1", "org_1")
        assert role.promotion_prompt == "New role prompt"

    @patch("httpx.Client.request")
    def test_roles_delete_204(self, mock_request, client):
        resp = _make_response(204, {})
        resp.content = b""
        resp.is_success = True
        mock_request.return_value = resp
        client.roles.delete("role_1", "org_1")


class TestTeamsResource:
    @patch("httpx.Client.request")
    def test_teams_list(self, mock_request, client):
        mock_request.return_value = _make_response(200, [TEAM_DICT])
        teams = client.teams.list(org_id="org_1")
        assert len(teams) == 1
        assert teams[0].team_id == "team_1"

    @patch("httpx.Client.request")
    def test_teams_create(self, mock_request, client):
        mock_request.return_value = _make_response(200, TEAM_DICT)
        team = client.teams.create(org_id="org_1", name="Platform", focus="Infrastructure team")
        assert team.team_id == "team_1"

    @patch("httpx.Client.request")
    def test_teams_get(self, mock_request, client):
        mock_request.return_value = _make_response(200, TEAM_DICT)
        team = client.teams.get(team_id="team_1", org_id="org_1")
        assert team.team_id == "team_1"

    @patch("httpx.Client.request")
    def test_teams_update(self, mock_request, client):
        updated = {**TEAM_DICT, "focus": "Platform & infra"}
        mock_request.return_value = _make_response(200, updated)
        team = client.teams.update("team_1", "org_1", focus="Platform & infra")
        assert team.focus == "Platform & infra"

    @patch("httpx.Client.request")
    def test_teams_delete_204(self, mock_request, client):
        resp = _make_response(204, {})
        resp.content = b""
        resp.is_success = True
        mock_request.return_value = resp
        client.teams.delete("team_1", "org_1")


class TestMemoriesResource:
    MEMORY_ITEM = {
        "memory_id": "mem_1",
        "org_id": "org_1",
        "scope": {"level": "actor", "actor_id": "user_1"},
        "type": "preference",
        "kind": "fact",
        "memory_kind": "semantic",
        "status": "active",
        "text": "User prefers dark mode",
        "confidence": 0.9,
        "strength": 0.8,
        "recall_count": 2,
        "decay_half_life_days": 30.0,
        "pinned": False,
        "tags": ["ui", "preferences"],
        "entity_refs": [],
        "source_event_ids": ["evt_1"],
        "source_urls": [],
    }

    @patch("httpx.Client.request")
    def test_memories_list(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {"items": [self.MEMORY_ITEM], "total": 1, "limit": 50, "offset": 0},
        )
        page = client.memories.list(kind="semantic")
        assert page.total == 1
        assert page.items[0].memory_id == "mem_1"
        assert page.items[0].text == "User prefers dark mode"

    @patch("httpx.Client.request")
    def test_memories_get(self, mock_request, client):
        mock_request.return_value = _make_response(200, self.MEMORY_ITEM)
        item = client.memories.get("mem_1")
        assert item.memory_id == "mem_1"
        assert item.confidence == 0.9
        assert "ui" in item.tags

    @patch("httpx.Client.request")
    def test_memories_stats(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {
                "total": 50,
                "total_memories": 50,
                "active_memories": 45,
                "by_type": {"preference": 20, "fact": 30},
                "by_kind": {"semantic": 40, "episodic": 10},
                "by_status": {"active": 45, "archived": 5},
                "avg_confidence": 0.85,
                "avg_strength": 0.75,
                "top_entities": [],
            },
        )
        stats = client.memories.stats()
        assert stats.total == 50
        assert stats.avg_confidence == 0.85
        assert stats.by_type == {"preference": 20, "fact": 30}

    @patch("httpx.Client.request")
    def test_memories_scope_deserialization(self, mock_request, client):
        mock_request.return_value = _make_response(200, self.MEMORY_ITEM)
        item = client.memories.get("mem_1")
        assert item.scope.level == "actor"
        assert item.scope.actor_id == "user_1"


class TestActorsResource:
    ACTOR = {
        "actor_id": "user_1",
        "first_memory_at": "2026-04-01T00:00:00+00:00",
        "last_memory_at": "2026-04-05T00:00:00+00:00",
        "memory_count": 12,
        "active_memory_count": 10,
        "scope_levels": ["actor"],
        "role_ids": ["role_1"],
        "team_ids": [],
    }

    def _envelope(self, items, **overrides):
        body = {"items": items, "total": len(items), "limit": 100, "offset": 0}
        body.update(overrides)
        return body

    @patch("httpx.Client.request")
    def test_actors_list(self, mock_request, client):
        mock_request.return_value = _make_response(200, self._envelope([self.ACTOR]))
        page = client.actors.list()
        assert page.total == 1
        assert page.items[0].actor_id == "user_1"
        assert page.items[0].memory_count == 12
        assert page.items[0].active_memory_count == 10
        assert page.items[0].role_ids == ["role_1"]

    @patch("httpx.Client.request")
    def test_actors_list_parses_the_envelope_not_a_bare_list(self, mock_request, client):
        """/actors returns {items, total, ...} unlike /roles, which returns a bare list."""
        mock_request.return_value = _make_response(200, self._envelope([self.ACTOR], total=7))
        page = client.actors.list()
        # total is the org's distinct-actor count, not len(items) on this page.
        assert page.total == 7
        assert len(page.items) == 1

    @patch("httpx.Client.request")
    def test_actors_list_defaults_truncated_to_false(self, mock_request, client):
        """An older server that predates the flag must not read as truncated."""
        mock_request.return_value = _make_response(200, self._envelope([self.ACTOR]))
        assert client.actors.list().truncated is False

    @patch("httpx.Client.request")
    def test_actors_list_surfaces_truncated(self, mock_request, client):
        mock_request.return_value = _make_response(
            200, self._envelope([self.ACTOR], truncated=True)
        )
        assert client.actors.list().truncated is True

    @patch("httpx.Client.request")
    def test_actors_list_omits_org_id_when_not_given(self, mock_request, client):
        """Server defaults to the caller's org; sending org_id=None would 403 or 422."""
        mock_request.return_value = _make_response(200, self._envelope([]))
        client.actors.list()
        assert "org_id" not in mock_request.call_args.kwargs["params"]

    @patch("httpx.Client.request")
    def test_actors_list_forwards_query_params(self, mock_request, client):
        mock_request.return_value = _make_response(200, self._envelope([]))
        client.actors.list("org_1", limit=25, offset=50, sort="actor_id_asc", q="slack")
        params = mock_request.call_args.kwargs["params"]
        assert params == {
            "limit": 25,
            "offset": 50,
            "sort": "actor_id_asc",
            "org_id": "org_1",
            "q": "slack",
        }

    @patch("httpx.Client.request")
    def test_actors_list_default_sort_is_newest_first(self, mock_request, client):
        mock_request.return_value = _make_response(200, self._envelope([]))
        client.actors.list()
        assert mock_request.call_args.kwargs["params"]["sort"] == "first_memory_desc"

    @patch("httpx.Client.request")
    def test_actors_get(self, mock_request, client):
        mock_request.return_value = _make_response(200, self.ACTOR)
        actor = client.actors.get("user_1")
        assert actor.actor_id == "user_1"
        assert actor.first_memory_at == "2026-04-01T00:00:00+00:00"
        assert actor.last_memory_at == "2026-04-05T00:00:00+00:00"

    @patch("httpx.Client.request")
    def test_actors_get_encodes_the_id_as_one_path_segment(self, mock_request, client):
        """Connector actor ids carry structure; a '/' must not escape /actors/."""
        mock_request.return_value = _make_response(200, self.ACTOR)
        client.actors.get("slack:T0B7FKNKKTR:U0B7TN132E9")
        url = str(mock_request.call_args.args[1])
        assert url.endswith("/actors/slack%3AT0B7FKNKKTR%3AU0B7TN132E9")

    @patch("httpx.Client.request")
    def test_actors_get_cannot_traverse_out_of_the_collection(self, mock_request, client):
        mock_request.return_value = _make_response(200, self.ACTOR)
        client.actors.get("../roles")
        url = str(mock_request.call_args.args[1])
        assert "/actors/..%2Froles" in url
        assert "/roles" not in url.replace("..%2Froles", "")

    @patch("httpx.Client.request")
    def test_actors_null_timestamps_survive(self, mock_request, client):
        """A memory whose created_at is the NULL sentinel yields None, not a crash."""
        mock_request.return_value = _make_response(
            200, {**self.ACTOR, "first_memory_at": None, "last_memory_at": None}
        )
        actor = client.actors.get("user_1")
        assert actor.first_memory_at is None
        assert actor.last_memory_at is None

    @patch("httpx.Client.request")
    def test_actors_missing_list_fields_default_to_empty(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"actor_id": "user_1"})
        actor = client.actors.get("user_1")
        assert actor.scope_levels == []
        assert actor.role_ids == []
        assert actor.team_ids == []
        assert actor.memory_count == 0
