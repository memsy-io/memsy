import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
  // Precedence: plugin config → MEMSY_API_KEY env (incl. ~/.openclaw/.env) →
  // the active profile's api_key in ~/.memsy/config.json. The last fallback
  // keeps OpenClaw consistent with the other hosts + the MCP: a key configured
  // once in the shared config (via `memsy auth login` or another host's
  // install) works here too — the plugin already reads that file for
  // actor_id/defaults, so it must honor the key there as well.
  const key = config.apiKey ?? process.env.MEMSY_API_KEY ?? sharedDefaults().apiKey;
  if (!key) {
    throw new Error(
      "Memsy API key not configured. Set MEMSY_API_KEY (e.g. in ~/.openclaw/.env), " +
        "add apiKey to the plugin config, or save it to ~/.memsy/config.json."
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
  apiKey?: string;
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
  // WHOLE-FILE precedence, identical to the MCP's findConfigFile
  // (mcp/src/config.ts): a per-project ./.memsy/config.json is used EXCLUSIVELY
  // when present; otherwise the per-user ~/.memsy/config.json. The two files are
  // never merged key-by-key — a partial project file merged against the global
  // could derive a different actor_id than the MCP, silently splitting writes
  // from reads across surfaces. readJson returns null for a missing file, so
  // `project ?? global` falls through correctly.
  const cfg = project ?? global;

  // Active profile: MEMSY_PROFILE env → the chosen file's active_profile → "default".
  const envProfile = process.env.MEMSY_PROFILE?.trim();
  const fileActive = typeof cfg?.active_profile === "string" ? (cfg.active_profile as string) : "";
  const profileName = envProfile || fileActive || "default";

  const slc = profileSlice(cfg, profileName);

  // List defaults: the active file profile's value, else the env var.
  const envList = (name: string): string[] =>
    parseStringList((process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const resolveList = (snake: string, camel: string, env: string): string[] => {
    const fromFile = parseStringList(slc[snake] ?? slc[camel]);
    return fromFile.length ? fromFile : envList(env);
  };

  _sharedDefaults = {
    profileName,
    actorId: (slc.actor_id ?? slc.actorId) as string | undefined,
    apiKey: (slc.api_key ?? slc.apiKey) as string | undefined,
    roleIds: resolveList("default_role_ids", "defaultRoleIds", "MEMSY_DEFAULT_ROLE_IDS"),
    teamIds: resolveList("default_team_ids", "defaultTeamIds", "MEMSY_DEFAULT_TEAM_IDS"),
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

// ── Org / roles / teams management ───────────────────────────────────────────
// Roles & teams need an explicit org_id, resolved from the control plane:
// the hot-path base ends in /v1; the control plane is the sibling /api. We
// GET /api/me once and cache the org_id (immutable for an API key).
function deriveControlUrl(baseUrl: string): string | null {
  return baseUrl.endsWith("/v1") ? `${baseUrl.slice(0, -3)}/api` : null;
}

let _orgId: string | undefined;
async function resolveOrgId(apiKey: string, baseUrl: string): Promise<string> {
  if (_orgId) return _orgId;
  const controlUrl = deriveControlUrl(baseUrl);
  if (!controlUrl) {
    throw new Error(
      `Cannot derive the Memsy control-plane URL from base_url="${baseUrl}" ` +
        `(it must end in "/v1"). Needed to look up your org_id for roles/teams.`,
    );
  }
  const resp = await fetch(`${controlUrl}/me`, { headers: authHeaders(apiKey) });
  const data = (await resp.json()) as { org_id?: string };
  if (!resp.ok || !data.org_id) {
    throw new Error(`Memsy /me failed (${resp.status}): ${JSON.stringify(data)}`);
  }
  _orgId = data.org_id;
  return _orgId;
}

// Persist chosen defaults to the SHARED Memsy config (~/.memsy/config.json) —
// the same file the apply layer reads and the MCP writes — so a choice made
// here applies everywhere. Read-modify-write the active profile; preserve the
// rest. There is no OpenClaw-native disk store (createPluginRuntimeStore holds
// an in-memory runtime ref only), and defaults are Memsy-global, so the shared
// config is the correct home.
function persistDefaults(update: { roleIds?: string[]; teamIds?: string[]; actorId?: string }): string {
  const dir = join(homedir(), ".memsy");
  const path = join(dir, "config.json");
  const cfg = (readJson(path) ?? {}) as Record<string, unknown>;
  const profileName = sharedDefaults().profileName;

  const profiles =
    cfg.profiles && typeof cfg.profiles === "object"
      ? (cfg.profiles as Record<string, Record<string, unknown>>)
      : {};
  const prof =
    profiles[profileName] && typeof profiles[profileName] === "object"
      ? profiles[profileName]
      : {};
  if (update.roleIds !== undefined) prof.default_role_ids = update.roleIds;
  if (update.teamIds !== undefined) prof.default_team_ids = update.teamIds;
  if (update.actorId !== undefined) prof.actor_id = update.actorId;
  profiles[profileName] = prof;
  cfg.profiles = profiles;
  if (typeof cfg.active_profile !== "string" || !cfg.active_profile) {
    cfg.active_profile = profileName;
  }

  mkdirSync(dir, { recursive: true });
  // Atomic write: serialize to a temp file then rename, so a crash mid-write
  // can't corrupt the config (it holds API keys). writeFileSync's mode only
  // applies on create and the file usually pre-exists, so chmod explicitly.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
  // Invalidate caches so subsequent search/ingest pick up the new defaults.
  _sharedDefaults = undefined;
  _actorId = undefined;
  return path;
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
  `Call memsy_ingest: content=<substance>, ts=<ISO 8601>, ` +
  `metadata={"source":"openclaw-proactive","safe_to_delete":true}, and kind matching the speaker the ` +
  `substance came FROM — "assistant_message" if it's something you produced or concluded, "user_message" ` +
  `if the user stated it (do NOT default everything to user_message).\n` +
  `Acknowledge after the primary answer: → saved to Memsy: "<first 60 chars>..." (event <id>)\n` +
  `Hard rules: save things useful 3+ months from now; do NOT ask permission every turn; ` +
  `do NOT save the user's questions — if the user is asking rather than asserting, skip the turn, and ` +
  `never rephrase a question into a pseudo-statement just to store something.`;

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
  actor_id: Type.Optional(
    Type.String({
      description:
        "Filter to a specific actor. Omit to use the active actor (the default); set all_actors:true for every actor.",
    }),
  ),
  all_actors: Type.Optional(
    Type.Boolean({
      description:
        "List across every actor (org-wide) instead of just the active one. Ignored when actor_id is set.",
    }),
  ),
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
    const _state = {
      autocontextFired: false,
      proactiveFired: false,
      modesFired: false,
      sessionId: randomUUID(),
    };

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
        "List memories with optional filters. Use when memsy_search returns nothing or the user wants to browse stored memories. Defaults to the ACTIVE actor only — pass all_actors:true for an org-wide view across every actor, or actor_id to filter to a specific actor.",
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
        // Actor scope mirrors the MCP's resolveListActorScope: an explicit
        // actor_id wins; all_actors=true lists org-wide; default = the active
        // actor, so "list" shows YOUR memories like search does.
        const explicitActor = p.actor_id?.trim();
        if (explicitActor) qs.set("actor_id", explicitActor);
        else if (!p.all_actors) qs.set("actor_id", resolveActorId());
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
        // Report the profile actually in effect — env OR the config file's
        // active_profile — not just the env var. The README's "wrong memories?"
        // troubleshooting points users here, so it must reflect file-selected
        // profiles too.
        const profileName = sharedDefaults().profileName;
        const profiles = [
          {
            profile_name: profileName,
            active: true,
            base_url: baseUrl,
            org_label: profileName,
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

    // ── memsy_list_roles ─────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_list_roles",
      label: "Memsy List Roles",
      description:
        "List roles defined in the active Memsy org. Use during onboarding so the user can pick which role(s) to set as defaults via memsy_set_defaults.",
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
        offset: Type.Optional(Type.Number({ minimum: 0 })),
      }),
      async execute(_toolCallId: string, params: unknown) {
        const p = params as { limit?: number; offset?: number };
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const orgId = await resolveOrgId(apiKey, baseUrl);
        const qs = new URLSearchParams({
          org_id: orgId,
          limit: String(p.limit ?? 100),
          offset: String(p.offset ?? 0),
        });
        const resp = await fetch(`${baseUrl}/roles?${qs.toString()}`, { headers: authHeaders(apiKey) });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy list roles failed (${resp.status}): ${JSON.stringify(data)}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], details: data };
      },
    });

    // ── memsy_create_role ────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_create_role",
      label: "Memsy Create Role",
      description:
        "Create a new role in the active Memsy org. Call memsy_list_roles first to avoid duplicates. Returns the new role_id, which can be passed to memsy_set_defaults.",
      parameters: Type.Object({
        name: Type.String({ minLength: 1, maxLength: 100, description: "Role name, e.g. 'Software Engineer'." }),
        focus: Type.String({
          minLength: 1,
          maxLength: 500,
          description:
            "One sentence on what this role's memories should emphasize. If the user didn't give one, draft a plausible focus from the name.",
        }),
      }),
      async execute(_toolCallId: string, params: unknown) {
        const p = params as { name: string; focus: string };
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const orgId = await resolveOrgId(apiKey, baseUrl);
        const resp = await fetch(`${baseUrl}/roles`, {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ org_id: orgId, name: p.name, focus: p.focus }),
        });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy create role failed (${resp.status}): ${JSON.stringify(data)}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], details: data };
      },
    });

    // ── memsy_list_teams ─────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_list_teams",
      label: "Memsy List Teams",
      description:
        "List teams defined in the active Memsy org. Use during onboarding so the user can pick which team(s) to set as defaults via memsy_set_defaults.",
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
        offset: Type.Optional(Type.Number({ minimum: 0 })),
      }),
      async execute(_toolCallId: string, params: unknown) {
        const p = params as { limit?: number; offset?: number };
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const orgId = await resolveOrgId(apiKey, baseUrl);
        const qs = new URLSearchParams({
          org_id: orgId,
          limit: String(p.limit ?? 100),
          offset: String(p.offset ?? 0),
        });
        const resp = await fetch(`${baseUrl}/teams?${qs.toString()}`, { headers: authHeaders(apiKey) });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy list teams failed (${resp.status}): ${JSON.stringify(data)}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], details: data };
      },
    });

    // ── memsy_create_team ────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_create_team",
      label: "Memsy Create Team",
      description:
        "Create a new team in the active Memsy org. Call memsy_list_teams first to avoid duplicates. Returns the new team_id, which can be passed to memsy_set_defaults.",
      parameters: Type.Object({
        name: Type.String({ minLength: 1, maxLength: 100, description: "Team name, e.g. 'Platform'." }),
        focus: Type.String({
          minLength: 1,
          maxLength: 500,
          description:
            "One sentence on what this team's memories should emphasize. If the user didn't give one, draft a plausible focus from the name.",
        }),
      }),
      async execute(_toolCallId: string, params: unknown) {
        const p = params as { name: string; focus: string };
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const orgId = await resolveOrgId(apiKey, baseUrl);
        const resp = await fetch(`${baseUrl}/teams`, {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ org_id: orgId, name: p.name, focus: p.focus }),
        });
        const data = (await resp.json()) as unknown;
        if (!resp.ok) throw new Error(`Memsy create team failed (${resp.status}): ${JSON.stringify(data)}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], details: data };
      },
    });

    // ── memsy_set_defaults ───────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_set_defaults",
      label: "Memsy Set Defaults",
      description:
        "Set the default role_ids / team_ids / actor_id for this Memsy profile, persisted to the shared ~/.memsy/config.json. They become search filters + ingest attribution here AND in every other Memsy host. Omit a field to leave it unchanged; pass [] to clear roles/teams.",
      parameters: Type.Object({
        role_ids: Type.Optional(Type.Array(Type.String())),
        team_ids: Type.Optional(Type.Array(Type.String())),
        actor_id: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async execute(_toolCallId: string, params: unknown) {
        const p = params as { role_ids?: string[]; team_ids?: string[]; actor_id?: string };
        if (p.role_ids === undefined && p.team_ids === undefined && p.actor_id === undefined) {
          throw new Error("Provide at least one of role_ids, team_ids, or actor_id.");
        }
        const path = persistDefaults({
          roleIds: p.role_ids,
          teamIds: p.team_ids,
          actorId: p.actor_id?.trim() || undefined,
        });
        const sd = sharedDefaults();
        const result: Record<string, unknown> = {
          persisted_to: path,
          profile: sd.profileName,
          default_role_ids: sd.roleIds,
          default_team_ids: sd.teamIds,
          actor_id: resolveActorId(),
        };
        if (p.actor_id && process.env.MEMSY_ACTOR_ID?.trim()) {
          result.warning =
            "MEMSY_ACTOR_ID env is set and overrides the persisted actor_id at runtime. " +
            "Unset it for the persisted value to take effect.";
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: result };
      },
    });

    // ── session_start hook — reset per-session flags ─────────────────────────
    api.on("session_start", (_event: unknown) => {
      _state.autocontextFired = false;
      _state.proactiveFired = false;
      _state.modesFired = false;
      _state.sessionId = randomUUID();
    });

    // ── heartbeat_prompt_contribution — proactive + auto-context injection ────
    // Fires each turn. Both blocks inject at most once per session, guarded by
    // their respective fired flags. If both fire on the same first turn they
    // are combined into a single prependContext return value.
    api.on("heartbeat_prompt_contribution", async (_event: unknown) => {
      let modesPart: string | undefined;
      let proactivePart: string | undefined;
      let recallPart: string | undefined;

      // ── Mode line (no API call needed) ───────────────────────────────────────
      // Emitted once per session whenever any mode is active, INDEPENDENT of
      // proactive: the memsy-remember skill keys its confirm-before-store step
      // off this exact "[memsy modes: ...]" line, so it must appear even when
      // MEMSY_CONFIRM_STORE=on is the only mode set. (It was previously emitted
      // only inside the proactive block, leaving confirm-store silently inert
      // unless proactive was also on.)
      if (!_state.modesFired) {
        const modes = [
          isConfirmStoreEnabled(config) ? "confirm-before-store" : "",
          isProactiveEnabled(config) ? "proactive" : "",
        ].filter(Boolean);
        if (modes.length) {
          _state.modesFired = true;
          modesPart = `[memsy modes: ${modes.join(" ")}]`;
          if (isConfirmStoreEnabled(config) && !isProactiveEnabled(config)) {
            // Standalone confirm-store: spell out the contract here, since no
            // proactive block will carry it this session.
            modesPart +=
              `\nBefore EVERY memsy_ingest call this session, surface the proposed ` +
              `content and ask: Save? (y / n / edit "<new text>"). Do not store ` +
              `without an explicit yes.`;
          }
        }
      }

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
            // Scope the recall block to the active actor — without this the
            // session-start context surfaces the whole org's memories, unlike
            // every other surface (search and the list tool are actor-scoped).
            const qs = new URLSearchParams({
              limit: String(limit),
              sort: "observed_at_desc",
              actor_id: resolveActorId(),
            });
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

      const combined = [modesPart, proactivePart, recallPart].filter(Boolean).join("\n\n");
      if (!combined) return;
      return { prependContext: combined + "\n" };
    });
  },
});
