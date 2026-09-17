import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _resetSessionId,
  getSessionId,
  resolveActorId,
  resolveSession,
  scopableConversationId,
} from "../src/identity.js";

const ORIGINAL_ENV = { ...process.env };

describe("resolveActorId", () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("MEMSY_")) delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("prefers MEMSY_ACTOR_ID env over everything", () => {
    process.env.MEMSY_ACTOR_ID = "alice";
    const out = resolveActorId({
      profile: { apiKey: "k", baseUrl: "x", actorId: "ignored" },
      profileName: "default",
    });
    expect(out.actorId).toBe("alice");
    expect(out.source).toBe("env");
  });

  it("falls back to profile.actorId when env absent", () => {
    const out = resolveActorId({
      profile: { apiKey: "k", baseUrl: "x", actorId: "bob" },
      profileName: "default",
    });
    expect(out.actorId).toBe("bob");
    expect(out.source).toBe("profile");
  });

  it("derives a 16-char hash when env+profile absent", () => {
    const out = resolveActorId({
      profile: { apiKey: "k", baseUrl: "x" },
      profileName: "default",
    });
    expect(out.actorId).toHaveLength(16);
    expect(out.source === "derived-git" || out.source === "derived-os").toBe(true);
  });
});

describe("resolveSession", () => {
  const PID = "4242";
  let dir: string;

  /** Raw note contents — for malformed-input cases. */
  function writeNote(pid: string, body: string): void {
    mkdirSync(join(dir, "sessions"), { recursive: true });
    writeFileSync(join(dir, "sessions", `${pid}.json`), body);
  }

  /**
   * A well-formed note, written "now" — i.e. after the stand-in socket's mtime,
   * so it passes the predates-this-process check.
   */
  function writeValidNote(pid: string, sessionId: string): void {
    writeNote(pid, JSON.stringify({ session_id: sessionId, source: "startup", updated_at: now() }));
  }

  const now = (): number => Math.floor(Date.now() / 1000);

  /** Backdate the stand-in socket, i.e. "the claude process started N seconds ago". */
  function processStartedSecondsAgo(seconds: number): void {
    const t = new Date((now() - seconds) * 1000);
    utimesSync(join(dir, `${PID}.sock`), t, t);
  }

  beforeEach(() => {
    _resetSessionId();
    dir = mkdtempSync(join(tmpdir(), "memsy-session-"));
    process.env.CLAUDE_PLUGIN_DATA = dir;
    // A real file stands in for the messaging socket: readSessionNote() stats it
    // to learn when this claude process started. It must be named <pid>.sock,
    // since that is where the pid itself comes from.
    writeFileSync(join(dir, `${PID}.sock`), "");
    processStartedSecondsAgo(60);
    process.env.CLAUDE_CODE_MESSAGING_SOCKET = join(dir, `${PID}.sock`);
    process.env.CLAUDE_CODE_SESSION_ID = "from-env";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    rmSync(dir, { recursive: true, force: true });
  });

  it("prefers the hook's note over the launch environment", () => {
    // The env value is fixed when the MCP starts; the note is rewritten on
    // every SessionStart. When they disagree, the note is the current one.
    writeValidNote(PID, "from-note");
    expect(resolveSession()).toEqual({ sessionId: "from-note", sessionSource: "note" });
  });

  it("falls back to the environment when there is no note", () => {
    expect(resolveSession()).toEqual({ sessionId: "from-env", sessionSource: "env" });
  });

  it("generates an id when neither names a conversation", () => {
    delete process.env.CLAUDE_CODE_SESSION_ID;
    const out = resolveSession();
    expect(out.sessionSource).toBe("generated");
    expect(out.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps the generated id stable within a process", () => {
    // Ingest requires a session_id on every event; a new one per call would
    // scatter one conversation's events across many.
    delete process.env.CLAUDE_CODE_SESSION_ID;
    expect(resolveSession().sessionId).toBe(resolveSession().sessionId);
  });

  it("picks up a note rewritten mid-process", () => {
    // The whole reason the note exists: `/clear` starts a new conversation
    // without restarting the MCP. Any caching here reintroduces the bug.
    writeValidNote(PID, "before-clear");
    expect(resolveSession().sessionId).toBe("before-clear");
    writeValidNote(PID, "after-clear");
    expect(resolveSession().sessionId).toBe("after-clear");
  });

  it("ignores a note belonging to a different claude process", () => {
    writeValidNote("9999", "another-window");
    expect(resolveSession()).toEqual({ sessionId: "from-env", sessionSource: "env" });
  });

  it("falls through when the note is malformed or empty", () => {
    for (const body of ["not json", "{}", '{"session_id": ""}', '{"session_id": 42}', "[]"]) {
      writeNote(PID, body);
      expect(resolveSession()).toEqual({ sessionId: "from-env", sessionSource: "env" });
    }
  });

  it("falls back to the environment when the socket names no pid", () => {
    delete process.env.CLAUDE_CODE_MESSAGING_SOCKET;
    writeValidNote(PID, "from-note");
    expect(resolveSession().sessionSource).toBe("env");
  });

  it("getSessionId returns the resolved id", () => {
    writeValidNote(PID, "from-note");
    expect(getSessionId()).toBe("from-note");
  });

  describe("scopableConversationId — the safety gate for the whole feature", () => {
    it("offers the note's id, the only rung that names the CURRENT conversation", () => {
      writeValidNote(PID, "from-note");
      expect(scopableConversationId()).toBe("from-note");
    });

    it("refuses the launch environment, which goes stale on /clear", () => {
      // CLAUDE_CODE_SESSION_ID is fixed when the process starts and the process
      // survives /clear. Reached only when the hook wrote no note — and we
      // cannot tell a pre-clear session from a post-clear one, so scoping by it
      // would silently return the conversation the user just left.
      expect(resolveSession().sessionSource).toBe("env");
      expect(scopableConversationId()).toBeNull();
    });

    it("refuses a generated id, which names no conversation at all", () => {
      delete process.env.CLAUDE_CODE_SESSION_ID;
      expect(resolveSession().sessionSource).toBe("generated");
      expect(scopableConversationId()).toBeNull();
    });

    it("still yields a usable id for ingest when scoping is refused", () => {
      // Ingest must send something on every event; only SEARCH abstains.
      delete process.env.CLAUDE_CODE_SESSION_ID;
      expect(scopableConversationId()).toBeNull();
      expect(getSessionId()).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("stops offering an id the moment the note stops being trustworthy", () => {
      writeValidNote(PID, "from-note");
      expect(scopableConversationId()).toBe("from-note");
      writeNote(PID, JSON.stringify({ session_id: "stale", updated_at: now() - 86400 }));
      expect(scopableConversationId()).toBeNull();
    });
  });

  describe("ids the server would reject", () => {
    // memsy-core validates a search session_id against [A-Za-z0-9_-:.@/] and
    // 256 chars. An id outside that 422s every scoped search; an over-long one
    // 422s memsy_ingest on EVERY call, since ingest has no scope opt-out. So an
    // unusable id must drop to the next rung rather than be propagated.
    const rejected: Record<string, string> = {
      "a space": "has a space",
      "a newline": "has\nnewline",
      "non-ASCII": "café",
      "a plus": "a+b",
      "over 256 chars": "x".repeat(257),
    };

    for (const [label, id] of Object.entries(rejected)) {
      it(`falls through when the note's id contains ${label}`, () => {
        writeNote(PID, JSON.stringify({ session_id: id, updated_at: now() }));
        expect(resolveSession()).toEqual({ sessionId: "from-env", sessionSource: "env" });
      });
    }

    it("falls through when the env value is unusable", () => {
      process.env.CLAUDE_CODE_SESSION_ID = "not a valid id";
      expect(resolveSession().sessionSource).toBe("generated");
    });

    it("accepts exactly 256 characters", () => {
      const id = "x".repeat(256);
      writeNote(PID, JSON.stringify({ session_id: id, updated_at: now() }));
      expect(resolveSession()).toEqual({ sessionId: id, sessionSource: "note" });
    });

    it("accepts the id shapes both hosts actually emit", () => {
      for (const id of ["bfac2620-0c77-43ba-a7c9-09f82349670e", "cc-71fd0f5c406cf922"]) {
        writeNote(PID, JSON.stringify({ session_id: id, updated_at: now() }));
        expect(resolveSession()).toEqual({ sessionId: id, sessionSource: "note" });
      }
    });
  });

  describe("a note that predates this process", () => {
    it("is refused, because pids get recycled and notes are never deleted", () => {
      // The dangerous input: a real conversation id, left by a DEAD window that
      // happened to have the same pid. Trusting it would scope the search to an
      // unrelated past chat at the highest-confidence rung — a confident wrong
      // answer, not a safe fallback.
      writeNote(
        PID,
        JSON.stringify({ session_id: "dead-window-conv", updated_at: now() - 86400 }),
      );
      expect(resolveSession()).toEqual({ sessionId: "from-env", sessionSource: "env" });
    });

    it("still trusts an old note from a still-running session", () => {
      // Not an age limit. A week-old note is fine if the process is older still
      // — someone who has had one window open for a week must keep working.
      processStartedSecondsAgo(14 * 86400);
      writeNote(PID, JSON.stringify({ session_id: "week-old-conv", updated_at: now() - 7 * 86400 }));
      expect(resolveSession()).toEqual({ sessionId: "week-old-conv", sessionSource: "note" });
    });

    it("is refused when it carries no timestamp to check", () => {
      writeNote(PID, JSON.stringify({ session_id: "unverifiable" }));
      expect(resolveSession()).toEqual({ sessionId: "from-env", sessionSource: "env" });
    });

    it("is refused when the process start time cannot be read", () => {
      // Socket gone: we cannot prove the note is ours, so we decline it. An
      // unscoped search is recoverable; the wrong conversation is not.
      writeValidNote(PID, "from-note");
      // Still ends in `<pid>.sock`, so the pid parses and the note IS found —
      // otherwise this would pass without exercising the branch at all.
      process.env.CLAUDE_CODE_MESSAGING_SOCKET = join(dir, "gone", `${PID}.sock`);
      expect(resolveSession()).toEqual({ sessionId: "from-env", sessionSource: "env" });
    });
  });
});
