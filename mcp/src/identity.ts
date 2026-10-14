import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { basename, isAbsolute, join } from "node:path";

import type { Profile } from "./config.js";

/**
 * Where a conversation id came from, and therefore how much to trust it.
 *
 * Only `note` and `env` name a real conversation. `generated` is a local
 * stand-in minted so ingest — where `session_id` is required — always has
 * something to send; it matches nothing on the server and must never be used
 * to scope a search.
 */
export type SessionSource = "note" | "env" | "generated";

export interface ResolvedSession {
  sessionId: string;
  sessionSource: SessionSource;
}

/**
 * Who we are, resolved once when a profile is activated.
 *
 * Deliberately carries no session id. The conversation changes mid-process on
 * `/clear` while this object does not, so a cached copy would go stale and read
 * as authoritative. Call `resolveSession()` at the point of use instead.
 */
export interface Identity {
  actorId: string;
  source: "tool-arg" | "env" | "profile" | "derived-git" | "derived-os";
}

function gitConfig(args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 1500,
    });
    const v = out.trim();
    return v || null;
  } catch {
    return null;
  }
}

// Module-level cache so we only fork git once per process. Without this,
// every memsy_use_org call would re-exec git (sync, blocks the event loop),
// stalling stdio JSON-RPC for up to 1.5s on slow setups.
//   undefined → unresolved; null → resolved-to-no-email
let _cachedGitEmail: string | null | undefined = undefined;

function safeGitEmail(): string | null {
  if (_cachedGitEmail !== undefined) return _cachedGitEmail;
  // Prefer --global so actor_id is stable across cwds (a per-repo
  // user.email override on the host's cwd would otherwise silently
  // fragment identity per project). Fall back to default scope if no
  // global is set, so users without ~/.gitconfig aren't unidentified.
  _cachedGitEmail =
    gitConfig(["config", "--global", "--get", "user.email"]) ??
    gitConfig(["config", "--get", "user.email"]);
  return _cachedGitEmail;
}

/** Test-only — reset the cached git email so resolveActorId re-probes. */
export function _resetGitEmailCache(): void {
  _cachedGitEmail = undefined;
}

function hashId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export interface ResolveOptions {
  /** Active profile (may carry an explicit actor_id override). */
  profile: Profile;
  /** Active profile name — used as the org-scoping component of the derived hash. */
  profileName: string;
}

export function resolveActorId(opts: ResolveOptions): {
  actorId: string;
  source: Identity["source"];
} {
  const fromEnv = process.env.MEMSY_ACTOR_ID;
  if (fromEnv) return { actorId: fromEnv, source: "env" };

  if (opts.profile.actorId) {
    return { actorId: opts.profile.actorId, source: "profile" };
  }

  const email = safeGitEmail();
  if (email) {
    return {
      actorId: hashId(opts.profileName, email),
      source: "derived-git",
    };
  }

  const u = userInfo({ encoding: "utf8" });
  return {
    actorId: hashId(opts.profileName, `${u.username}@${hostname()}`),
    source: "derived-os",
  };
}

/**
 * The `claude` process this MCP belongs to.
 *
 * Not handed to us directly — but CLAUDE_CODE_MESSAGING_SOCKET is
 * `/tmp/cc-socks/<pid>.sock`, and the hooks get the same pid as CLAUDE_PID. It
 * is the one identifier both sides can derive independently, which is why the
 * session note is filed under it.
 */
/**
 * Where the session notes live, as an absolute path.
 *
 * The hook writes here and the MCP reads here, so the two must land on the
 * same directory or the note is written somewhere the reader never looks and
 * scoping silently stops working. That means the rule has to be implementable
 * identically in Python and TypeScript, which constrains it:
 *
 *   - a leading `~` or `~/` is expanded
 *   - `~user` is NOT, deliberately. Python's `expanduser` resolves it through
 *     the passwd database and Node has no equivalent, so supporting it would
 *     mean hand-rolling a lookup and matching every edge case of a function we
 *     don't control.
 *   - anything not absolute after that is ignored, falling back to `~/.memsy`.
 *     Relative paths resolve against the process's own cwd, and the hook's cwd
 *     is not the MCP's.
 *
 * Ignoring an odd value costs an unexpected-but-shared directory. Honouring it
 * differently on each side costs the feature, silently. `session_start.py`
 * implements the same rule — keep them in step.
 */
function sessionNotesBase(): string {
  const raw = process.env.CLAUDE_PLUGIN_DATA;
  const fallback = join(homedir(), ".memsy");
  if (!raw) return fallback;
  let expanded = raw;
  if (raw === "~") expanded = homedir();
  else if (raw.startsWith("~/")) expanded = join(homedir(), raw.slice(2));
  return isAbsolute(expanded) ? expanded : fallback;
}

function claudePid(): string | null {
  const sock = process.env.CLAUDE_CODE_MESSAGING_SOCKET;
  if (!sock) return null;
  const pid = basename(sock).replace(/\.sock$/, "");
  return /^\d+$/.test(pid) ? pid : null;
}

/**
 * What memsy-core accepts as a session id on `/search`:
 * `_SEARCHABLE_ID_PATTERN` and `_MAX_ID_LENGTH` in its `http/schemas.py`.
 *
 * Kept in step deliberately. Ingest is laxer than search server-side — it
 * checks length but not charset — so an id can store fine and then 422 every
 * scoped search. Worse, an over-long id 422s `memsy_ingest` outright, on every
 * call, until whatever wrote it is fixed. Neither host we support emits such an
 * id (Claude Code sends UUIDs), so this is a guard against a future host or a
 * hand-edited note, not a live bug.
 */
const SEARCHABLE_SESSION_ID = /^[A-Za-z0-9_\-:.@/]{1,256}$/;

/**
 * Trim and validate a candidate session id, or null if it isn't usable.
 *
 * Returning null drops us to the next rung rather than propagating an id the
 * server may refuse — better an unscoped search than a tool that errors on
 * every call.
 */
function usableSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return SEARCHABLE_SESSION_ID.test(trimmed) ? trimmed : null;
}

/**
 * When the `claude` process we belong to started, in epoch seconds.
 *
 * Its messaging socket is created at startup, so the socket's mtime dates the
 * process. Measured within 2s of `ps -o lstart` across every live session on a
 * developer machine. Using the socket rather than forking `ps` matters because
 * this runs on every search and ingest.
 *
 * Returns null when the socket can't be stat'd, which callers treat as
 * "cannot verify" rather than "verified fresh".
 */
function claudeStartedAt(): number | null {
  const sock = process.env.CLAUDE_CODE_MESSAGING_SOCKET;
  if (!sock) return null;
  try {
    return statSync(sock).mtimeMs / 1000;
  } catch {
    return null;
  }
}

/**
 * Read the conversation id the SessionStart hook recorded for this window.
 *
 * Deliberately re-read on every call rather than cached. The whole point of the
 * note is that the answer changes mid-process: `/clear` starts a new
 * conversation without restarting the MCP, and the hook rewrites the note. A
 * cache would reintroduce exactly the staleness this exists to fix.
 *
 * The note is rejected unless it was written AFTER our claude process started.
 * Notes are keyed by pid, nothing deletes them, and OS pids get recycled — so
 * without this a new window inheriting an old pid could read a dead session's
 * note and scope to a real but unrelated conversation, at the highest-trust
 * rung. That is the one input class that yields a confident wrong answer rather
 * than a safe fallback.
 *
 * This is not an age limit: a week-old note from a still-running session is
 * fine. The comparison is against process start, so only notes that predate
 * this process are refused.
 */
function readSessionNote(): string | null {
  const pid = claudePid();
  if (!pid) return null;
  const base = sessionNotesBase();
  try {
    const raw = readFileSync(join(base, "sessions", `${pid}.json`), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const note = parsed as Record<string, unknown>;

    // Refuse a note that predates this process — see the doc comment. A missing
    // or unreadable start time means we cannot verify, so we refuse too: an
    // unscoped search is recoverable, the wrong conversation is not.
    const startedAt = claudeStartedAt();
    const writtenAt = typeof note.updated_at === "number" ? note.updated_at : null;
    if (startedAt === null || writtenAt === null) return null;
    // A couple of seconds of slack: `updated_at` is whole seconds while the
    // socket mtime is fractional, and the two are written by different clocks.
    if (writtenAt < startedAt - 2) return null;

    return usableSessionId(note.session_id);
  } catch {
    return null;
  }
}

// Last-resort id, minted once so it is at least stable within this process.
// Only reached when neither the note nor the env names a conversation.
let _generatedSessionId: string | null = null;

/**
 * Work out which conversation this MCP is currently serving.
 *
 *   1. the note   — written by the SessionStart hook, correct across `/clear`
 *   2. the env    — CLAUDE_CODE_SESSION_ID, fixed at launch, so correct only
 *                   until the first `/clear`
 *   3. generated  — names no real conversation; exists because ingest requires
 *                   a session_id. Never scope a search by this.
 */
export function resolveSession(): ResolvedSession {
  const fromNote = readSessionNote();
  if (fromNote) return { sessionId: fromNote, sessionSource: "note" };

  const fromEnv = usableSessionId(process.env.CLAUDE_CODE_SESSION_ID);
  if (fromEnv) return { sessionId: fromEnv, sessionSource: "env" };

  // Written without relying on narrowing a module-level `let`: `??` yields a
  // plain `string` regardless of how a given tsc version treats the assignment.
  const generated = _generatedSessionId ?? randomUUID();
  _generatedSessionId = generated;
  return { sessionId: generated, sessionSource: "generated" };
}

export function getSessionId(): string {
  return resolveSession().sessionId;
}

/**
 * The conversation id a SEARCH may be scoped by — or null, meaning don't scope.
 *
 * Only the note qualifies. The other two rungs are usable for ingest, which
 * must send something, but not for narrowing a search:
 *
 *   - `generated` names no conversation at all. Scoping by it matches nothing
 *     and returns an empty list that reads as "you have no memories about
 *     this" rather than "I don't know which conversation you're in".
 *   - `env` is `CLAUDE_CODE_SESSION_ID`, fixed when this process launched. It
 *     is correct until the first `/clear` and silently names the conversation
 *     the user just left thereafter — the exact bug this feature exists to fix.
 *     It is only reached when the hook did not write a note, and we cannot tell
 *     a pre-clear session from a post-clear one, so we decline to guess.
 *
 * Returning null degrades the search to unscoped, which the caller is told
 * about. Too many results is visible; the wrong conversation is not.
 */
export function scopableConversationId(): string | null {
  const { sessionId, sessionSource } = resolveSession();
  return sessionSource === "note" ? sessionId : null;
}

/** Test-only — drop the generated fallback so the next call re-resolves. */
export function _resetSessionId(): void {
  _generatedSessionId = null;
}

export function buildIdentity(opts: ResolveOptions): Identity {
  const { actorId, source } = resolveActorId(opts);
  return { actorId, source };
}
