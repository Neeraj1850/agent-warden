import { DEFAULT_POLICY_PROFILES } from "@agent-warden/core";
import { getPolicyProfileInputSchema } from "../schemas/mcp.schemas.js";

export const getPolicyProfileToolName = "get_policy_profile";

export const getPolicyProfileToolDescription =
  "Return one built-in deterministic AgentWarden policy profile by ID.";

export const getPolicyProfileToolInputSchema = getPolicyProfileInputSchema;

export async function executeGetPolicyProfileTool(input: { profileId: string }) {
  const profile = DEFAULT_POLICY_PROFILES[input.profileId];

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          profile
            ? { profile }
            : { error: "Profile not found", profileId: input.profileId },
          null,
          2
        )
      }
    ],
    isError: profile === undefined
  };
}
