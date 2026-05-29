import { Type } from "@sinclair/typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const DEFAULT_BASE_URL = "https://api.memsy.io";
const DEFAULT_CONTEXT_LIMIT = 6;

interface PluginConfig {
  apiKey?: string;
  baseUrl?: string;
  sessionAutoContext?: boolean;
  sessionContextLimit?: number;
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

function contextLimit(config: PluginConfig): number {
  if (config.sessionContextLimit !== undefined) {
    return Math.min(Math.max(config.sessionContextLimit, 1), 20);
  }
  const raw = process.env.MEMSY_SESSION_CONTEXT_LIMIT;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) return Math.min(Math.max(n, 1), 20);
  }
  return DEFAULT_CONTEXT_LIMIT;
}

export default definePluginEntry({
  id: "memsy",
  name: "Memsy",
  description:
    "Long-term memory for OpenClaw agents — recall, store, and surface context across channels.",

  register(api) {
    // Plugin config is accessed at runtime; start with empty defaults and
    // read process.env lazily inside each tool call so env vars set after
    // plugin load are picked up correctly.
    const config: PluginConfig = {};

    // ── memsy_health ─────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_health",
      description:
        "Check Memsy service health. Call this first when any other Memsy tool errors.",
      parameters: Type.Object({}),
      async execute() {
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const resp = await fetch(`${baseUrl}/health`, {
          headers: authHeaders(apiKey),
        });
        const data = (await resp.json()) as unknown;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ── memsy_search ─────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_search",
      description:
        "Search Memsy long-term memory for past decisions, preferences, and context. Use when the user asks what was decided, remembered, or discussed previously.",
      parameters: Type.Object({
        query: Type.String({ description: "What to search for" }),
        limit: Type.Optional(
          Type.Number({
            description: "Number of results (1–100, default 8)",
            minimum: 1,
            maximum: 100,
          })
        ),
        since: Type.Optional(
          Type.String({
            description: "ISO 8601 — only memories observed after this time",
          })
        ),
        threshold: Type.Optional(
          Type.Number({
            description: "Minimum similarity score 0–1 (default 0.0)",
            minimum: 0,
            maximum: 1,
          })
        ),
      }),
      async execute(_id, params) {
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const body: Record<string, unknown> = {
          query: params.query,
          limit: params.limit ?? 8,
          threshold: params.threshold ?? 0.0,
        };
        if (params.since) body.since = params.since;
        const resp = await fetch(`${baseUrl}/search`, {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify(body),
        });
        const data = (await resp.json()) as unknown;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ── memsy_ingest ─────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_ingest",
      description:
        "Store a memory event in Memsy. Use when the user explicitly says to remember, save, or note something.",
      parameters: Type.Object({
        events: Type.Array(
          Type.Object({
            kind: Type.Union([
              Type.Literal("user_message"),
              Type.Literal("assistant_message"),
              Type.Literal("tool_result"),
              Type.Literal("app_event"),
            ]),
            content: Type.String({
              description: "The memory content",
              maxLength: 32000,
            }),
            ts: Type.Optional(
              Type.String({ description: "ISO 8601 timestamp" })
            ),
            metadata: Type.Optional(
              Type.String({ description: "JSON string of extra metadata" })
            ),
          }),
          { description: "Events to ingest (max 100 per call)" }
        ),
      }),
      async execute(_id, params) {
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const resp = await fetch(`${baseUrl}/ingest`, {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ events: params.events }),
        });
        const data = (await resp.json()) as unknown;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ── memsy_list_memories ──────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_list_memories",
      description:
        "List memories with optional filters. Use when memsy_search returns nothing or the user wants to browse stored memories.",
      parameters: Type.Object({
        limit: Type.Optional(
          Type.Number({ description: "Number to return (default 20)" })
        ),
        offset: Type.Optional(
          Type.Number({ description: "Pagination offset" })
        ),
        sort: Type.Optional(
          Type.String({ description: "Sort order e.g. 'observed_at_desc'" })
        ),
        search: Type.Optional(Type.String({ description: "Free-text filter" })),
        kind: Type.Optional(Type.String({ description: "Filter by memory kind" })),
        status: Type.Optional(Type.String({ description: "Filter by status e.g. 'active'" })),
      }),
      async execute(_id, params) {
        const apiKey = resolveApiKey(config);
        const baseUrl = resolveBaseUrl(config);
        const qs = new URLSearchParams();
        if (params.limit != null) qs.set("limit", String(params.limit));
        if (params.offset != null) qs.set("offset", String(params.offset));
        if (params.sort) qs.set("sort", params.sort);
        if (params.search) qs.set("search", params.search);
        if (params.kind) qs.set("kind", params.kind);
        if (params.status) qs.set("status", params.status);
        const url = `${baseUrl}/memories${qs.size > 0 ? "?" + qs.toString() : ""}`;
        const resp = await fetch(url, { headers: authHeaders(apiKey) });
        const data = (await resp.json()) as unknown;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ── memsy_list_orgs ──────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_list_orgs",
      description:
        "List available Memsy profiles/orgs. Use to check which org is active or discover available profiles.",
      parameters: Type.Object({}),
      async execute() {
        // Local introspection — no network call needed.
        // Full multi-profile support requires the @memsy-io/mcp config layer;
        // in this plugin, profile selection is via env vars.
        const baseUrl = resolveBaseUrl(config);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                [
                  {
                    profile_name: process.env.MEMSY_PROFILE ?? "default",
                    active: true,
                    base_url: baseUrl,
                    org_label: process.env.MEMSY_PROFILE ?? "Default",
                  },
                ],
                null,
                2
              ),
            },
          ],
        };
      },
    });

    // ── memsy_use_org ────────────────────────────────────────────────────────
    api.registerTool({
      name: "memsy_use_org",
      description:
        "Switch the active Memsy profile. Requires restarting OpenClaw with the new profile env var.",
      parameters: Type.Object({
        profile: Type.String({ description: "Profile name to switch to" }),
      }),
      async execute(_id, params) {
        return {
          content: [
            {
              type: "text",
              text: `To switch to profile "${params.profile}", restart OpenClaw with:\n  MEMSY_PROFILE=${params.profile} MEMSY_API_KEY=<that-profile-key> openclaw start`,
            },
          ],
        };
      },
    });

    // ── session_start hook — auto-context injection ───────────────────────────
    // Fires at session lifecycle boundaries. When MEMSY_SESSION_AUTOCONTEXT=on
    // (or sessionAutoContext: true in plugin config), fetches recent memories
    // and returns a context contribution for the agent's first turn.
    api.on("session_start", async (_event) => {
      if (!isAutoContextEnabled(config)) return;

      const limit = contextLimit(config);

      let apiKey: string;
      try {
        apiKey = resolveApiKey(config);
      } catch {
        // API key not configured — silently skip rather than blocking startup.
        return;
      }

      const baseUrl = resolveBaseUrl(config);

      try {
        const qs = new URLSearchParams({
          limit: String(limit),
          sort: "observed_at_desc",
        });
        const resp = await fetch(`${baseUrl}/memories?${qs.toString()}`, {
          headers: authHeaders(apiKey),
        });
        if (!resp.ok) return;

        type MemoryItem = { text?: string; content?: string; observed_at?: string };
        const data = (await resp.json()) as { memories?: MemoryItem[] };
        const memories = data.memories ?? [];
        if (memories.length === 0) return;

        const lines = memories
          .slice(0, limit)
          .map((m, i) => {
            const text = (m.text ?? m.content ?? "").slice(0, 200);
            const date = m.observed_at ? ` — ${m.observed_at}` : "";
            return `${i + 1}. ${text}${date}`;
          })
          .join("\n");

        // Return context contribution for this session start.
        // OpenClaw injects the returned contextContribution into the agent prompt.
        return {
          contextContribution: `[Memsy recall (top ${memories.length})]\n${lines}\n`,
        };
      } catch {
        // Network failure — silently skip so startup is never blocked.
      }
    });
  },
});
