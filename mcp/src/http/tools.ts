/**
 * ChatGPT-shaped tools for the hosted server: search, fetch, save.
 *
 * These are deliberately NOT the stdio server's memsy_* tools — ChatGPT's
 * connector / Deep Research / Company Knowledge surfaces want tools literally
 * named `search` and `fetch` with their own result schemas. We map memsy-core's
 * output into that shape here.
 *
 * Three plan gotchas are enforced on every tool:
 *   - annotations (readOnlyHint / destructiveHint / openWorldHint) are REQUIRED
 *   - every result returns BOTH structuredContent AND a JSON string in content[]
 *   - securitySchemes is declared (via tool-level _meta) so ChatGPT knows the
 *     tool needs OAuth
 *
 * On the _meta cast-free trick: the SDK's registerTool config type does not list
 * `_meta`, and TypeScript's excess-property check would reject it on an inline
 * object literal. MCP's Tool DOES allow `_meta`, so we declare each config as a
 * `const` first — excess-property checks only fire on literals passed directly
 * to a call, not on a variable — which lets the spec-valid field ride along
 * while preserving zod's `args` inference in the handler.
 *
 * NOTE (verify against your installed SDK): whether registerTool forwards this
 * `_meta` onto the wire `tools/list` entry is version-dependent. The 401 +
 * WWW-Authenticate path (server.ts) is the spec-guaranteed OAuth-UI trigger;
 * the tool-level securitySchemes is the belt-and-suspenders leg the plan calls
 * for.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SCOPE_READ, SCOPE_WRITE } from "./config.js";
import { AuthError } from "./auth.js";
import type { RequestContext } from "./context.js";

/** Build the double-return every ChatGPT tool result must have: the typed
 *  object in `structuredContent`, and the SAME object JSON-stringified in
 *  `content[]`. Omitting either causes silent failures in Deep Research /
 *  Company Knowledge. */
function dualResult(structured: Record<string, unknown>) {
  return {
    structuredContent: structured,
    content: [{ type: "text" as const, text: JSON.stringify(structured) }],
  };
}

/** OAuth security scheme advertised on every tool — one leg of the trifecta
 *  that makes ChatGPT render the login screen. */
const TOOL_META = {
  securitySchemes: {
    oauth2: {
      type: "oauth2",
      scopes: [SCOPE_READ, SCOPE_WRITE],
    },
  },
};

function requireScope(ctx: RequestContext, scope: string): void {
  if (!ctx.scopes.includes(scope)) {
    throw new AuthError("insufficient_scope", `missing required scope: ${scope}`);
  }
}

/**
 * Register search/fetch/save against a per-request context. Called once per
 * request with that request's RequestContext (the hosted server builds a fresh
 * McpServer per call — see server.ts).
 */
export function registerHostedTools(server: McpServer, ctx: RequestContext): void {
  // -------------------------------------------------------------------------
  // search — recall. Read-only, talks to an open world (the user's memories).
  // -------------------------------------------------------------------------
  const searchConfig = {
    title: "Search Memsy",
    description:
      "Search the user's long-term memory for information relevant to a query. " +
      "Returns ranked memories. Use this whenever the user refers to past decisions, " +
      "preferences, projects, people, or anything they expect you to remember.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Natural-language query. Matched semantically — paraphrase freely."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    _meta: TOOL_META,
  };
  server.registerTool("search", searchConfig, async (args) => {
    requireScope(ctx, SCOPE_READ);
    const res = await ctx.client.search(args.query, {
      // Org-wide search (actorId omitted), mirroring the stdio server's
      // documented default — memories created via any channel (dashboard, SDK,
      // prior sessions, other actors) are findable. Ingest still ATTRIBUTES to
      // ctx.actorId; only visibility is org-wide.
      // TODO(P1): for multi-user orgs this exposes every member's memories to
      // each ChatGPT user. Decide per deployment whether to scope to
      // ctx.actorId (privacy) or keep org-wide (shared-memory pitch).
      limit: 10,
    });
    // ChatGPT search result shape: { results: [{ id, title, text, url }] }.
    const results = res.results.map((r) => ({
      id: r.id,
      title: deriveTitle(r.content),
      text: r.content,
      url: sourceUrl(r) ?? "",
      score: r.score,
    }));
    return dualResult({ results });
  });

  // -------------------------------------------------------------------------
  // fetch — full record by id (≈ the stdio get_memory). Read-only.
  // -------------------------------------------------------------------------
  const fetchConfig = {
    title: "Fetch a memory",
    description:
      "Fetch the full content of a single memory by its id, as returned by `search`.",
    inputSchema: {
      id: z.string().min(1).describe("The memory id returned by search."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    _meta: TOOL_META,
  };
  server.registerTool("fetch", fetchConfig, async (args) => {
    requireScope(ctx, SCOPE_READ);
    const m = await ctx.client.memories.get(args.id);
    // ChatGPT fetch result shape: { id, title, text, url, metadata }.
    return dualResult({
      id: m.memoryId,
      title: deriveTitle(m.text ?? ""),
      text: m.text ?? "",
      url: (m.sourceUrls && m.sourceUrls[0]) ?? "",
      metadata: {
        kind: m.memoryKind ?? m.kind ?? null,
        scope: m.scope ?? null,
        tags: m.tags ?? null,
        created_at: m.createdAt ?? null,
      },
    });
  });

  // -------------------------------------------------------------------------
  // save — store a new memory. NOT read-only; mutates. destructiveHint stays
  // false (it only adds, never deletes/overwrites).
  // -------------------------------------------------------------------------
  const saveConfig = {
    title: "Save to Memsy",
    description:
      "Store a new memory for future recall. Use after the user states a decision, " +
      "preference, or fact worth remembering. Stores concise content, not raw transcripts.",
    inputSchema: {
      content: z
        .string()
        .min(1)
        .max(32_000)
        .describe("The thing to remember — 1-3 concise sentences."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    _meta: TOOL_META,
  };
  const saveHandler = async (args: { content: string }) => {
    requireScope(ctx, SCOPE_WRITE);
    const res = await ctx.client.ingest([
      {
        // Attribution forced from the token.
        actorId: ctx.actorId,
        sessionId: ctx.sessionId,
        kind: "app_event",
        content: args.content,
      },
    ]);
    return dualResult({
      saved: true,
      event_ids: res.eventIds,
    });
  };
  server.registerTool("save", saveConfig, saveHandler);
}

/** First line / first ~80 chars of the memory, used as a display title. */
function deriveTitle(text: string): string {
  const firstLine = text.split("\n", 1)[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine || "(memory)";
}

/** Pull a source URL out of a search result's metadata if present. */
function sourceUrl(r: { sourceMetadata?: unknown }): string | null {
  const sm = r.sourceMetadata;
  if (Array.isArray(sm)) {
    for (const entry of sm) {
      if (entry && typeof entry === "object" && typeof (entry as { url?: unknown }).url === "string") {
        return (entry as { url: string }).url;
      }
    }
  }
  return null;
}
