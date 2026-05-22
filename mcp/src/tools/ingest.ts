import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EventKind, EventPayload } from "@memsy-io/memsy";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

const KIND_VALUES = [
  "user_message",
  "assistant_message",
  "tool_result",
  "app_event",
] as const satisfies readonly EventKind[];

const MAX_EVENTS_PER_BATCH = 100;
const MAX_CONTENT_CHARS = 32_000;
const MAX_METADATA_CHARS = 4_096;

const EventSchema = z.object({
  kind: z
    .enum(KIND_VALUES)
    .describe(
      "Event kind. user_message / assistant_message for chat turns; tool_result for tool outputs; app_event for everything else (decisions, facts, edits).",
    ),
  content: z
    .string()
    .min(1)
    .max(MAX_CONTENT_CHARS)
    .describe(`Free-text content (1-${MAX_CONTENT_CHARS} chars). The actual thing being stored.`),
  actor_id: z
    .string()
    .optional()
    .describe("Override the active profile's actor_id for this event. Rare — usually omit."),
  session_id: z
    .string()
    .optional()
    .describe("Override the active session_id. Rare — usually omit; the server fills it."),
  role_id: z.string().optional().describe("Optional role attribution."),
  team_id: z.string().optional().describe("Optional team attribution."),
  ts: z.string().optional().describe("ISO 8601 timestamp; defaults to now."),
  metadata: z
    .string()
    .max(MAX_METADATA_CHARS)
    .optional()
    .describe(`Free-form metadata as a JSON-encoded string (≤${MAX_METADATA_CHARS} chars).`),
});

export function registerIngest(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_ingest",
    "Store one or more events in Memsy for future recall. The memory engine extracts facts/decisions/preferences asynchronously — use memsy_status to confirm processing. Prefer batching (up to 100 events).",
    {
      events: z
        .array(EventSchema)
        .min(1)
        .max(MAX_EVENTS_PER_BATCH)
        .describe(`Batch of events to ingest (1-${MAX_EVENTS_PER_BATCH}).`),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const fallbackActor = ctx.identity.actorId;
        const fallbackSession = ctx.identity.sessionId;

        const payload: EventPayload[] = args.events.map((e) => ({
          actorId: e.actor_id ?? fallbackActor,
          sessionId: e.session_id ?? fallbackSession,
          kind: e.kind,
          content: e.content,
          roleId: e.role_id,
          teamId: e.team_id,
          ts: e.ts,
          metadata: e.metadata,
        }));

        const res = await ctx.client.ingest(payload);
        return jsonResult({
          profile: ctx.profileName,
          actor_id: fallbackActor,
          session_id: fallbackSession,
          event_ids: res.eventIds,
          ingested: res.eventIds.length,
          usage: res.usage,
          rate_limit: res.rateLimit,
        });
      } catch (err) {
        return formatError("memsy_ingest", err);
      }
    },
  );
}
