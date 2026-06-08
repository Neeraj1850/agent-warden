import type { IntentAction } from "./intent.types.js";
import type { Address } from "./transaction.types.js";

export type PolicyProfileMode = "strict" | "balanced" | "permissive-testnet";

export interface PolicyProfile {
  profileId: string;
  name: string;
  mode: PolicyProfileMode;
  allowedChains?: number[];
  allowedActions?: IntentAction[];
  allowedRecipients?: Address[];
  allowedTokens?: Address[];
  allowedSpenders?: Address[];
  allowedOperators?: Address[];
  allowedRouters?: Address[];
  maxNativeValue?: string;
  maxTokenAmounts?: PolicyProfileTokenLimit[];
  blockApprovals?: boolean;
  blockOperatorApprovals?: boolean;
  blockContractDeployments?: boolean;
  blockUnknownContracts?: boolean;
  requireSimulation?: boolean;
  requireExpectedOutcome?: boolean;
  metadata?: Record<string, string>;
}

export interface PolicyProfileTokenLimit {
  tokenAddress: Address;
  maxAmount: string;
}
