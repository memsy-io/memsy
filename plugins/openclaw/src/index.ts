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

function isAutoContextEnabled(config: PluginConfig): boolean {
  if (config.sessionAutoContext !== undefined) return config.sessionAutoContext;
  const v = (process.env.MEMSY_SESSION_AUTOCONTEXT ?? "").toLowerCase();
  return ["on", "true", "1", "yes", "enabled"].includes(v);
}

function isProactiveEnabled(config: PluginConfig): boolean {
  if (config.proactive !== undefined) return config.proactive;
  const v = (process.env.MEMSY_PROACTIVE ?? "").toLowerCase();
  return ["on", "true", "1", "yes", "enabled"].includes(v);
}

function isConfirmStoreEnabled(config: PluginConfig): boolean {
  if (config.confirmStore !== undefined) return config.confirmStore;
  const v = (process.env.MEMSY_CONFIRM_STORE ?? "").toLowerCase();
  return ["on", "true", "1", "yes", "enabled"].includes(v);
}

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
    // fresh context blocks each session.
    const _state = { autocontextFired: false, proactiveFired: false };

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
        };
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
        const resp = await fetch(`${baseUrl}/ingest`, {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ events: p.events }),
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
    });

    // ── heartbeat_prompt_contribution — proactive + auto-context injection ────
    // Fires each turn during the agent's prompt build cycle. Both blocks fire
    // at most once per session (guarded by their respective fired flags).
    api.on("heartbeat_prompt_contribution", async (_event: unknown) => {
      const parts: string[] = [];

      // ── Proactive mode instruction (fires once, no API call needed) ──────────
      if (isProactiveEnabled(config) && !_state.proactiveFired) {
        _state.proactiveFired = true;
        const confirmNote = isConfirmStoreEnabled(config)
          ? "\n  confirm-before-store is also active — ask Save? (y / n / edit \"...\") before each ingest."
          : "";
        parts.push(
          `[memsy proactive mode — MEMSY_PROACTIVE=on]\n\n` +
          `For the rest of this conversation, actively watch for content the user clearly wants remembered, ` +
          `EVEN IF they don't say "remember that". Categories that qualify:\n` +
          `  - Personal preferences: "I like X", "my favorite is Y", "I prefer Z"\n` +
          `  - Intents / plans: "I want to do X", "I plan to Y", "we're going to Z"\n` +
          `  - Decisions: "we decided X", "going with Y", "switching to Z", "we need X"\n` +
          `  - Constraints: "X doesn't work because Y", "we can't do Z"\n` +
          `  - Learnings: "turns out X", "the trick is Y", "found that Z"\n\n` +
          `Pre-flight: skip if <20 chars; skip secret-shaped tokens (msy_/sk_/ghp_/Bearer); skip duplicates.${confirmNote}\n` +
          `Call memsy_ingest: kind="user_message", content=<substance>, ts=<ISO 8601>, ` +
          `metadata={"source":"openclaw-proactive","safe_to_delete":true}\n` +
          `Acknowledge after the primary answer: → saved to Memsy: "<first 60 chars>..." (event <id>)\n` +
          `Hard rule: save things useful 3+ months from now. Do NOT ask permission every turn.`
        );
      }

      // ── Auto-context recall (fires once, requires API call) ──────────────────
      if (isAutoContextEnabled(config) && !_state.autocontextFired) {
        _state.autocontextFired = true;

        let apiKey: string;
        try {
          apiKey = resolveApiKey(config);
        } catch {
          // No key configured — skip silently.
        }

        if (apiKey!) {
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
                parts.push(`[Memsy recall (top ${memories.length})]\n${lines}`);
              }
            }
          } catch {
            // Network failure — never block the agent turn.
          }
        }
      }

      if (parts.length === 0) return;
      return { prependContext: parts.join("\n\n") + "\n" };
    });
  },
});
