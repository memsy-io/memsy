import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { hostname, userInfo } from "node:os";

import type { Profile } from "./config.js";

export interface Identity {
  actorId: string;
  sessionId: string;
  source: "tool-arg" | "env" | "profile" | "derived-git" | "derived-os";
}

function safeGitEmail(): string | null {
  try {
    const out = execFileSync("git", ["config", "--get", "user.email"], {
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

let _sessionId: string | null = null;

export function getSessionId(): string {
  if (_sessionId === null) _sessionId = randomUUID();
  return _sessionId;
}

/** Test-only — reset the cached session id. */
export function _resetSessionId(): void {
  _sessionId = null;
}

export function buildIdentity(opts: ResolveOptions): Identity {
  const { actorId, source } = resolveActorId(opts);
  return { actorId, sessionId: getSessionId(), source };
}
