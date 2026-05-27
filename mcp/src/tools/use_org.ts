import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerUseOrg(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_use_org",
    "Switch the active Memsy profile (i.e. switch which org/API key subsequent tool calls hit). Profile must already exist in config — use `memsy auth login` to add new ones.",
    {
      profile: z
        .string()
        .min(1)
        .describe('Profile name as listed by memsy_list_orgs (e.g. "personal", "work").'),
    },
    async (args) => {
      try {
        if (!profiles.hasProfile(args.profile)) {
          const available = profiles
            .listProfiles()
            .map((p) => p.profileName)
            .join(", ");
          throw new Error(`Unknown profile "${args.profile}". Available: ${available || "(none)"}`);
        }

        const ctx = profiles.activate(args.profile);
        return jsonResult({
          active_profile: ctx.profileName,
          org_label: ctx.profile.orgLabel ?? null,
          base_url: ctx.profile.baseUrl,
          actor_id: ctx.identity.actorId,
          actor_id_source: ctx.identity.source,
        });
      } catch (err) {
        return formatError("memsy_use_org", err);
      }
    },
  );
}
