import type { PolicyProfile } from "../types/policy-profile.types.js";

export const DEFAULT_POLICY_PROFILE_ID = "default";

export const DEFAULT_POLICY_PROFILES: Record<string, PolicyProfile> = {
  default: {
    profileId: "default",
    name: "Default Balanced",
    mode: "balanced"
  },
  "strict-treasury": {
    profileId: "strict-treasury",
    name: "Strict Treasury",
    mode: "strict",
    allowedActions: ["native_transfer", "token_transfer", "transfer"],
    blockApprovals: true,
    blockOperatorApprovals: true,
    blockContractDeployments: true,
    blockUnknownContracts: true,
    requireExpectedOutcome: true
  },
  "testnet-developer": {
    profileId: "testnet-developer",
    name: "Testnet Developer",
    mode: "permissive-testnet",
    allowedChains: [11155111, 84532, 421614, 11155420],
    blockOperatorApprovals: true
  },
  payment: {
    profileId: "payment",
    name: "Payment Agent",
    mode: "strict",
    allowedActions: ["native_transfer", "token_transfer", "transfer"],
    blockApprovals: true,
    blockOperatorApprovals: true,
    blockContractDeployments: true,
    blockUnknownContracts: true,
    requireExpectedOutcome: true
  },
  trading: {
    profileId: "trading",
    name: "Trading Agent",
    mode: "balanced",
    allowedActions: ["swap", "multicall"],
    blockContractDeployments: true,
    blockUnknownContracts: true,
    requireSimulation: true,
    requireExpectedOutcome: true
  }
};

export function resolvePolicyProfile(
  profileId: string | undefined,
  inlineProfile: PolicyProfile | undefined
): PolicyProfile {
  if (inlineProfile) {
    return inlineProfile;
  }

  return (
    DEFAULT_POLICY_PROFILES[profileId ?? DEFAULT_POLICY_PROFILE_ID] ??
    DEFAULT_POLICY_PROFILES[DEFAULT_POLICY_PROFILE_ID]!
  );
}
