import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { join } from "node:path";

import { Type, type Static } from "@sinclair/typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const DEFAULT_BASE_URL = "https://api.memsy.io/v1";
const DEFAULT_CONTEXT_LIMIT = 6;

interface PluginConfig {
  apiKey?: string;
  baseUrl?: string;
  sessionAutoContext?: boolean;
  sessionContextLimit?: number;
  proactive?: boolean;
  confirmStore?: boolean;
}

function resolveApiKey(config: PluginConfig): string {
  const key = config.apiKey ?? process.env.MEMSY_API_KEY;
  if (!key) {
    throw new Error(
      "Memsy API key not configured. Set MEMSY_API_KEY or add apiKey to the plugin config."
    );
  }
  return key;
}

function resolveBaseUrl(config: PluginConfig): string {
  return config.baseUrl ?? process.env.MEMSY_BASE_URL ?? DEFAULT_BASE_URL;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// ── Shared defaults (READ-ONLY) ──────────────────────────────────────────────
// Read default role_ids / team_ids / actor_id from the shared Memsy config —
// ~/.memsy/config.json, overridden per-project by ./.memsy/config.json — the
// SAME file the MCP and the `setup-defaults` flow write. So defaults configured
// once in any host apply here too. We never WRITE this file: managing defaults
// (create/list roles+teams, set_defaults) stays with the MCP hosts / dashboard
// (see README). Read once and cache.
interface SharedDefaults {
  profileName: string;
  actorId?: string;
  roleIds: string[];
  teamIds: string[];
}

function parseStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function profileSlice(cfg: Record<string, unknown> | null, profile: string): Record<string, unknown> {
  if (!cfg) return {};
  const profs = cfg.profiles;
  if (profs && typeof profs === "object") {
    const p = (profs as Record<string, unknown>)[profile];
    return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
  }
  return cfg; // legacy flat config == the single default profile
}

let _sharedDefaults: SharedDefaults | undefined;
function sharedDefaults(): SharedDefaults {
  if (_sharedDefaults) return _sharedDefaults;
  const global = readJson(join(homedir(), ".memsy", "config.json"));
  const project = readJson(join(process.cwd(), ".memsy", "config.json"));

  // Active profile: MEMSY_PROFILE env → global active_profile → "default".
  const envProfile = process.env.MEMSY_PROFILE?.trim();
  const fileActive = typeof global?.active_profile === "string" ? (global.active_profile as string) : "";
  const profileName = envProfile || fileActive || "default";

  const g = profileSlice(global, profileName);
  const p = profileSlice(project, profileName);
  const pick = <T>(...vals: T[]): T | undefined => vals.find((v) => v !== undefined);

  const roles =
    parseStringList(p.default_role_ids ?? p.defaultRoleIds);
  const gRoles = parseStringList(g.default_role_ids ?? g.defaultRoleIds);
  const teams = parseStringList(p.default_team_ids ?? p.defaultTeamIds);
  const gTeams = parseStringList(g.default_team_ids ?? g.defaultTeamIds);
  const envRoles = parseStringList((process.env.MEMSY_DEFAULT_ROLE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const envTeams = parseStringList((process.env.MEMSY_DEFAULT_TEAM_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

  _sharedDefaults = {
    profileName,
    actorId: pick(p.actor_id, p.actorId, g.actor_id, g.actorId) as string | undefined,
    roleIds: roles.length ? roles : gRoles.length ? gRoles : envRoles,
    teamIds: teams.length ? teams : gTeams.length ? gTeams : envTeams,
  };
  return _sharedDefaults;
}

// ── Identity ─────────────────────────────────────────────────────────────────
// actor_id MUST match what the MCP server derives (mcp/src/identity.ts:
// resolveActorId), or memories written here land under a different actor than
// memsy_search reads — and recall silently finds nothing. Precedence:
// MEMSY_ACTOR_ID env → shared-config profile actor_id → sha256('<profile>|<git-email>')
// → sha256('<profile>|<user>@<host>'). Cached: git is forked once.
function gitEmail(): string | null {
  for (const args of [
    ["config", "--global", "--get", "user.email"],
    ["config", "--get", "user.email"],
  ]) {
    try {
      const out = execFileSync("git", args, {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
        timeout: 1500,
      }).trim();
      if (out) return out;
    } catch {
      // git missing or no email at this scope — fall through.
    }
  }
  return null;
}

function hashId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

let _actorId: string | undefined;
function resolveActorId(): string {
  if (_actorId) return _actorId;
  const explicit = process.env.MEMSY_ACTOR_ID?.trim();
  if (explicit) {
    _actorId = explicit;
    return _actorId;
  }
  const sd = sharedDefaults();
  const fromConfig = sd.actorId?.trim();
  if (fromConfig) {
    _actorId = fromConfig;
    return _actorId;
  }
  // Use the resolved active profile name (env → config active_profile → default)
  // as the hash component, matching the MCP exactly even when the profile is
  // selected via ~/.memsy/config.json rather than MEMSY_PROFILE.
  const email = gitEmail();
  _actorId = email
    ? hashId(sd.profileName, email)
    : hashId(sd.profileName, `${userInfo().username}@${hostname()}`);
  return _actorId;
}

const TRUTHY = new Set(["on", "true", "1", "yes", "enabled"]);

function isFlagEnabled(configVal: boolean | undefined, envVar: string): boolean {
  if (configVal !== undefined) return configVal;
  return TRUTHY.has((process.env[envVar] ?? "").toLowerCase());
}

const isAutoContextEnabled = (c: PluginConfig) => isFlagEnabled(c.sessionAutoContext, "MEMSY_SESSION_AUTOCONTEXT");
const isProactiveEnabled   = (c: PluginConfig) => isFlagEnabled(c.proactive,          "MEMSY_PROACTIVE");
const isConfirmStoreEnabled = (c: PluginConfig) => isFlagEnabled(c.confirmStore,       "MEMSY_CONFIRM_STORE");

// Proactive mode instruction injected once per session into the agent's context.
// Kept as a module-level constant so it isn't rebuilt on every heartbeat call.
const PROACTIVE_INSTRUCTION_BASE =
  `[memsy proactive mode — MEMSY_PROACTIVE=on]\n\n` +
  `For the rest of this conversation, actively watch for content the user clearly wants remembered, ` +
  `EVEN IF they don't say "remember that". Categories that qualify:\n` +
  `  - Personal preferences: "I like X", "my favorite is Y", "I prefer Z"\n` +
  `  - Intents / plans: "I want to do X", "I plan to Y", "we're going to Z"\n` +
  `  - Decisions: "we decided X", "going with Y", "switching to Z", "we need X"\n` +
  `  - Constraints: "X doesn't work because Y", "we can't do Z"\n` +
  `  - Learnings: "turns out X", "the trick is Y", "found that Z"\n\n` +
  `Pre-flight: skip if <20 chars; skip secret-shaped tokens (msy_/sk_/ghp_/Bearer); skip duplicates.\n` +
  `Call memsy_ingest: kind="user_message", content=<substance>, ts=<ISO 8601>, ` +
  `metadata={"source":"openclaw-proactive","safe_to_delete":true}\n` +
  `Acknowledge after the primary answer: → saved to Memsy: "<first 60 chars>..." (event <id>)\n` +
  `Hard rule: save things useful 3+ months from now. Do NOT ask permission every turn.`;

const PROACTIVE_CONFIRM_NOTE =
  `\n  confirm-before-store is also active — ask Save? (y / n / edit "...") before each ingest.`;

function contextLimit(config: PluginConfig): number {
  const n = config.sessionContextLimit ?? parseInt(process.env.MEMSY_SESSION_CONTEXT_LIMIT ?? "", 10);
  if (!Number.isNaN(n) && n >= 1) return Math.min(n, 20);
  return DEFAULT_CONTEXT_LIMIT;
}

// Tool parameter schemas
const SearchParams = Type.Object({
  query: Type.String({ description: "What to search for" }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  since: Type.Optional(Type.String()),
  threshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

const IngestEvent = Type.Object({
  kind: Type.Union([
    Type.Literal("user_message"),
    Type.Literal("assistant_message"),
    Type.Literal("tool_result"),
    Type.Literal("app_event"),
  ]),
  content: Type.String({ maxLength: 32000 }),
  ts: Type.Optional(Type.String()),
  metadata: Type.Optional(Type.String()),
});

const IngestParams = Type.Object({
  events: Type.Array(IngestEvent),
});

const ListMemoriesParams = Type.Object({
  limit: Type.Optional(Type.Number()),
  offset: Type.Optional(Type.Number()),
  sort: Type.Optional(Type.String()),
  search: Type.Optional(Type.String()),
  kind: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
});

const UseOrgParams = Type.Object({
  profile: Type.String(),
});

type SearchParamsType = Static<typeof SearchParams>;
type IngestParamsType = Static<typeof IngestParams>;
type ListMemoriesParamsType = Static<typeof ListMemoriesParams>;
type UseOrgParamsType = Static<typeof UseOrgParams>;

export default definePluginEntry({
  id: "memsy",
  name: "Memsy",
  description:
    "Long-term memory for OpenClaw agents — recall, store, and surface context across channels.",

  register(api) {
    const config: PluginConfig = {};

    // Fired-once flags: reset on session_start so /new and idle-rotation get
    // fresh context blocks each session. sessionId is sent on every ingest
    // event (required by /ingest) and likewise rotates per session.
    const _state = { autocontextFired: false, proactiveFired: false, sessionId: randomUUID() };

    // ── memsy_health ─────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_health",
      label: "Memsy Health",
      description:
        "Check Memsy service health. Call this first when any other Memsy tool errors.",
      parameters: Type.Object({}),
      async execute(_toolCallId: string, _params: unknown) {
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const resp = await fetch(`${baseUrl}/health`, {
          headers: authHeaders(apiKey),
        });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy health check failed (${resp.status}): ${JSON.stringify(data)}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          details: data,
        };
      },
    });

    // ── memsy_search ─────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_search",
      label: "Memsy Search",
      description:
        "Search Memsy long-term memory for past decisions, preferences, and context.",
      parameters: SearchParams,
      async execute(_toolCallId: string, params: unknown) {
        const p = params as SearchParamsType;
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const body: Record<string, unknown> = {
          query: p.query,
          limit: p.limit ?? 8,
          threshold: p.threshold ?? 0.0,
          actor_id: resolveActorId(),
        };
        // Apply default role/team filters from shared config (only when set —
        // never send empty arrays, which would change query semantics).
        const sd = sharedDefaults();
        if (sd.roleIds.length) body.role_ids = sd.roleIds;
        if (sd.teamIds.length) body.team_ids = sd.teamIds;
        if (p.since) body.since = p.since;
        const resp = await fetch(`${baseUrl}/search`, {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify(body),
        });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy search failed (${resp.status}): ${JSON.stringify(data)}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          details: data,
        };
      },
    });

    // ── memsy_ingest ─────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_ingest",
      label: "Memsy Ingest",
      description:
        "Store a memory event in Memsy. Use when the user explicitly says to remember, save, or note something.",
      parameters: IngestParams,
      async execute(_toolCallId: string, params: unknown) {
        const p = params as IngestParamsType;
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        // The agent supplies kind/content/ts/metadata; inject the identity
        // fields /ingest requires (actor_id + session_id) so the agent never
        // has to — mirroring how the MCP server fills them. Without this every
        // ingest 422s and nothing is stored.
        // Auto-tag role_id/team_id ONLY when exactly one default is configured
        // (mirrors the MCP's singleOrUndef — a multi-value default can't pick
        // one to attribute). No defaults → nothing added (today's behavior).
        const sd = sharedDefaults();
        const roleId = sd.roleIds.length === 1 ? sd.roleIds[0] : undefined;
        const teamId = sd.teamIds.length === 1 ? sd.teamIds[0] : undefined;
        const events = p.events.map((e) => ({
          ...e,
          actor_id: resolveActorId(),
          session_id: _state.sessionId,
          ...(roleId ? { role_id: roleId } : {}),
          ...(teamId ? { team_id: teamId } : {}),
        }));
        const resp = await fetch(`${baseUrl}/ingest`, {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ events }),
        });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy ingest failed (${resp.status}): ${JSON.stringify(data)}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          details: data,
        };
      },
    });

    // ── memsy_list_memories ──────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_list_memories",
      label: "Memsy List Memories",
      description:
        "List memories with optional filters. Use when memsy_search returns nothing or the user wants to browse stored memories.",
      parameters: ListMemoriesParams,
      async execute(_toolCallId: string, params: unknown) {
        const p = params as ListMemoriesParamsType;
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const qs = new URLSearchParams();
        if (p.limit != null) qs.set("limit", String(p.limit));
        if (p.offset != null) qs.set("offset", String(p.offset));
        if (p.sort) qs.set("sort", p.sort);
        if (p.search) qs.set("search", p.search);
        if (p.kind) qs.set("kind", p.kind);
        if (p.status) qs.set("status", p.status);
        const url = `${baseUrl}/console/memories${qs.size > 0 ? "?" + qs.toString() : ""}`;
        const resp = await fetch(url, { headers: authHeaders(apiKey) });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy list memories failed (${resp.status}): ${JSON.stringify(data)}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          details: data,
        };
      },
    });

    // ── memsy_list_orgs ──────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_list_orgs",
      label: "Memsy List Orgs",
      description:
        "List available Memsy profiles/orgs. Use to check which org is active.",
      parameters: Type.Object({}),
      async execute(_toolCallId: string, _params: unknown) {
        const baseUrl = resolveBaseUrl(config);
        const profiles = [
          {
            profile_name: process.env.MEMSY_PROFILE ?? "default",
            active: true,
            base_url: baseUrl,
            org_label: process.env.MEMSY_PROFILE ?? "Default",
          },
        ];
        return {
          content: [{ type: "text" as const, text: JSON.stringify(profiles, null, 2) }],
          details: profiles,
        };
      },
    });

    // ── memsy_use_org ────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_use_org",
      label: "Memsy Use Org",
      description:
        "Switch the active Memsy profile. Requires restarting OpenClaw with the new profile env var.",
      parameters: UseOrgParams,
      async execute(_toolCallId: string, params: unknown) {
        const p = params as UseOrgParamsType;
        const text = `To switch to profile "${p.profile}", restart OpenClaw with:\n  MEMSY_PROFILE=${p.profile} MEMSY_API_KEY=<that-profile-key> openclaw start`;
        return {
          content: [{ type: "text" as const, text }],
          details: { profile: p.profile },
        };
      },
    });

    // ── session_start hook — reset per-session flags ─────────────────────────
    api.on("session_start", (_event: unknown) => {
      _state.autocontextFired = false;
      _state.proactiveFired = false;
      _state.sessionId = randomUUID();
    });

    // ── heartbeat_prompt_contribution — proactive + auto-context injection ────
    // Fires each turn. Both blocks inject at most once per session, guarded by
    // their respective fired flags. If both fire on the same first turn they
    // are combined into a single prependContext return value.
    api.on("heartbeat_prompt_contribution", async (_event: unknown) => {
      let proactivePart: string | undefined;
      let recallPart: string | undefined;

      // ── Proactive mode instruction (no API call needed) ──────────────────────
      if (isProactiveEnabled(config) && !_state.proactiveFired) {
        _state.proactiveFired = true;
        const confirmNote = isConfirmStoreEnabled(config) ? PROACTIVE_CONFIRM_NOTE : "";
        proactivePart = PROACTIVE_INSTRUCTION_BASE.replace(
          "skip duplicates.\n",
          `skip duplicates.${confirmNote}\n`,
        );
      }

      // ── Auto-context recall (requires API call) ──────────────────────────────
      if (isAutoContextEnabled(config) && !_state.autocontextFired) {
        _state.autocontextFired = true;

        let apiKey: string | undefined;
        try {
          apiKey = resolveApiKey(config);
        } catch {
          // No key configured — skip silently.
        }

        if (apiKey) {
          const baseUrl = resolveBaseUrl(config);
          const limit = contextLimit(config);
          try {
            const qs = new URLSearchParams({ limit: String(limit), sort: "observed_at_desc" });
            const resp = await fetch(`${baseUrl}/console/memories?${qs.toString()}`, {
              headers: authHeaders(apiKey),
            });
            if (resp.ok) {
              type MemoryItem = { text?: string; content?: string; observed_at?: string };
              const data = (await resp.json()) as { memories?: MemoryItem[] };
              const memories = data.memories ?? [];
              if (memories.length > 0) {
                const lines = memories
                  .slice(0, limit)
                  .map((m, i) => {
                    const text = (m.text ?? m.content ?? "").slice(0, 200);
                    const date = m.observed_at ? ` — ${m.observed_at}` : "";
                    return `${i + 1}. ${text}${date}`;
                  })
                  .join("\n");
                recallPart = `[Memsy recall (top ${memories.length})]\n${lines}`;
              }
            }
          } catch {
            // Network failure — never block the agent turn.
          }
        }
      }

      const combined = [proactivePart, recallPart].filter(Boolean).join("\n\n");
      if (!combined) return;
      return { prependContext: combined + "\n" };
    });
  },
});
