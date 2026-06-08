import { DEFAULT_POLICY_PROFILES } from "@agent-warden/core";

export const listPolicyProfilesToolName = "list_policy_profiles";

export const listPolicyProfilesToolDescription =
  "List built-in deterministic AgentWarden policy profiles.";

export const listPolicyProfilesToolInputSchema = {};

export async function executeListPolicyProfilesTool() {
  const profiles = Object.values(DEFAULT_POLICY_PROFILES).map((profile) => ({
    profileId: profile.profileId,
    name: profile.name,
    mode: profile.mode,
    allowedChains: profile.allowedChains,
    allowedActions: profile.allowedActions,
    allowedRecipients: profile.allowedRecipients,
    allowedTokens: profile.allowedTokens,
    allowedSpenders: profile.allowedSpenders,
    allowedOperators: profile.allowedOperators,
    allowedRouters: profile.allowedRouters,
    maxNativeValue: profile.maxNativeValue,
    maxTokenAmounts: profile.maxTokenAmounts,
    blockApprovals: profile.blockApprovals,
    blockOperatorApprovals: profile.blockOperatorApprovals,
    blockContractDeployments: profile.blockContractDeployments,
    blockUnknownContracts: profile.blockUnknownContracts,
    requireSimulation: profile.requireSimulation,
    requireExpectedOutcome: profile.requireExpectedOutcome
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ profiles }, null, 2)
      }
    ]
  };
}
