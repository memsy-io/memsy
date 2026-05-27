import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { persistProfileDefaults, type PersistScope } from "../config.js";
import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

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
      actor_id: z
        .string()
        .min(1)
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

        // After updateDefaults, the live identity reflects the new actor_id
        // unless MEMSY_ACTOR_ID env is set (env wins over profile). Surface
        // that so the caller isn't confused when their persisted value is
        // silently shadowed.
        const refreshed = profiles.current();
        const envShadowing =
          args.actor_id !== undefined &&
          process.env.MEMSY_ACTOR_ID !== undefined &&
          refreshed.identity.actorId !== args.actor_id;

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
          ...(envShadowing && {
            warning:
              "MEMSY_ACTOR_ID env var is set and takes precedence over the persisted profile actor_id. " +
              "Unset the env var (in your MCP host's config) for the new value to take effect.",
          }),
        });
      } catch (err) {
        return formatError("memsy_set_defaults", err);
      }
    },
  );
}
