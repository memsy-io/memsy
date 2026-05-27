import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { persistProfileDefaults, type PersistScope } from "../config.js";
import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

/**
 * Schema for actor_id values accepted by memsy_set_defaults. Exported so
 * tests can verify the rejection rules without instantiating an McpServer.
 * Rejects: empty strings (min(1)), whitespace-only values, and values with
 * leading/trailing whitespace — those would be unfilterable in the dashboard
 * and the tool offers no clear path to fix them.
 */
export const actorIdSchema = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0 && s.trim() === s, {
    message:
      "actor_id must be non-empty and cannot contain leading or trailing whitespace " +
      "(whitespace-only values are unfilterable and look broken in the dashboard).",
  });

/**
 * Build the envShadowing warning message for the memsy_set_defaults response,
 * or return null when no warning is warranted. Extracted for unit testability.
 *
 * Fires whenever MEMSY_ACTOR_ID is truthy AND the caller asked to set
 * actor_id — even when env equals the just-set value — because env being
 * load-bearing is the user-relevant fact, regardless of whether it currently
 * conflicts. (Boolean() matches resolveActorId's `if (fromEnv)` truthy check,
 * so an empty MEMSY_ACTOR_ID is correctly ignored.)
 */
export function computeEnvShadowingWarning(args: {
  argActorId: string | undefined;
  envActorId: string | undefined;
  effectiveActorId: string;
}): string | null {
  if (args.argActorId === undefined) return null;
  if (!args.envActorId) return null; // unset or empty string — not shadowing

  if (args.effectiveActorId !== args.argActorId) {
    return (
      `MEMSY_ACTOR_ID env var (value: "${args.envActorId}") takes precedence over the profile actor_id. ` +
      `The persisted value "${args.argActorId}" is recorded in the config file but identity remains "${args.effectiveActorId}" (source: env). ` +
      "Unset MEMSY_ACTOR_ID in the host's MCP config for the persisted value to take effect."
    );
  }
  return (
    "MEMSY_ACTOR_ID env var is set and matches the value you persisted, but env is what's actually load-bearing right now (source: env). " +
    "If you later change or unset the env var, identity will fall back to the persisted profile value."
  );
}

export function registerSetDefaults(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_set_defaults",
    "Set default role_ids, team_ids, and/or actor_id for the active Memsy profile. Defaults are applied as filters by memsy_search and as attribution by memsy_ingest when per-call args aren't supplied. Use this to onboard a user once instead of asking them to pass these on every call. " +
      "For actor_id, common values are an agent identifier (claude-code, cursor, vscode, zed, cline, coder-agent) or a personal handle (alex-dev). Whatever you choose, search defaults to org-wide so existing memories stay findable.",
    {
      role_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Role IDs to apply as the default search filter. Omit to leave the current value unchanged; pass [] to clear.",
        ),
      team_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Team IDs to apply as the default search filter. Omit to leave the current value unchanged; pass [] to clear.",
        ),
      actor_id: actorIdSchema
        .optional()
        .describe(
          "Identity to tag every memsy_ingest event with for this profile. Pins to a stable value across host restarts so events aren't fragmented by the git-derived hash. " +
            "Suggested values: 'claude-code', 'cursor', 'vscode', 'zed', 'cline', 'coder-agent', or a personal handle like 'alex-dev'. " +
            "Omit to leave the current value unchanged. To clear and revert to the git-derived default, edit the config file directly.",
        ),
      persist: z
        .enum(["none", "global", "project"])
        .default("none")
        .describe(
          "Where to save the new defaults. 'none' = in-memory only (lost when the host restarts). " +
            "'global' = ~/.memsy/config.json (applies to every project). " +
            "'project' = ./.memsy/config.json in the current working directory (overrides global for this project at load time).",
        ),
    },
    async (args) => {
      try {
        if (
          args.role_ids === undefined &&
          args.team_ids === undefined &&
          args.actor_id === undefined
        ) {
          throw new Error("At least one of role_ids, team_ids, or actor_id must be provided.");
        }

        const ctx = profiles.current();
        const updated = profiles.updateDefaults(ctx.profileName, {
          defaultRoleIds: args.role_ids,
          defaultTeamIds: args.team_ids,
          actorId: args.actor_id,
        });

        let persistInfo: { path: string; created: boolean } | null = null;
        if (args.persist !== "none") {
          persistInfo = persistProfileDefaults(
            args.persist as PersistScope,
            ctx.profileName,
            updated,
            {
              defaultRoleIds: args.role_ids,
              defaultTeamIds: args.team_ids,
              actorId: args.actor_id,
            },
          );
        }

        const refreshed = profiles.current();
        const warning = computeEnvShadowingWarning({
          argActorId: args.actor_id,
          envActorId: process.env.MEMSY_ACTOR_ID,
          effectiveActorId: refreshed.identity.actorId,
        });

        return jsonResult({
          profile: ctx.profileName,
          default_role_ids: updated.defaultRoleIds ?? [],
          default_team_ids: updated.defaultTeamIds ?? [],
          actor_id: updated.actorId ?? null,
          effective_actor_id: refreshed.identity.actorId,
          effective_actor_id_source: refreshed.identity.source,
          persist: args.persist,
          ...(persistInfo && {
            persisted_to: persistInfo.path,
            file_created: persistInfo.created,
          }),
          ...(warning && { warning }),
        });
      } catch (err) {
        return formatError("memsy_set_defaults", err);
      }
    },
  );
}
