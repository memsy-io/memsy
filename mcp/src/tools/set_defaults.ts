import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { persistProfileDefaults, type PersistScope } from "../config.js";
import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerSetDefaults(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_set_defaults",
    "Set the default role_ids and/or team_ids for the active Memsy profile. These are applied as filters by memsy_search and as attribution by memsy_ingest when the per-call args aren't supplied. Use this to onboard a user once instead of asking them to pass role/team on every call.",
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
        if (args.role_ids === undefined && args.team_ids === undefined) {
          throw new Error("At least one of role_ids or team_ids must be provided.");
        }

        const ctx = profiles.current();
        const updated = profiles.updateDefaults(ctx.profileName, {
          defaultRoleIds: args.role_ids,
          defaultTeamIds: args.team_ids,
        });

        let persistInfo: { path: string; created: boolean } | null = null;
        if (args.persist !== "none") {
          persistInfo = persistProfileDefaults(
            args.persist as PersistScope,
            ctx.profileName,
            updated,
            { defaultRoleIds: args.role_ids, defaultTeamIds: args.team_ids },
          );
        }

        return jsonResult({
          profile: ctx.profileName,
          default_role_ids: updated.defaultRoleIds ?? [],
          default_team_ids: updated.defaultTeamIds ?? [],
          persist: args.persist,
          ...(persistInfo && {
            persisted_to: persistInfo.path,
            file_created: persistInfo.created,
          }),
        });
      } catch (err) {
        return formatError("memsy_set_defaults", err);
      }
    },
  );
}
