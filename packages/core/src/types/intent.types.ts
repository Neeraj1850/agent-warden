import type { Address } from "./transaction.types.js";

export type IntentAction =
  | "transfer"
  | "approve"
  | "contract_call"
  | "native_transfer"
  | "token_transfer"
  | "approval"
  | "nft_transfer"
  | "swap"
  | "multicall"
  | "deployment";

export interface TransactionIntent {
  intentId?: string;
  action: IntentAction;
  chainId: number;
  from: Address;
  tokenAddress?: Address;
  recipient?: Address;
  spender?: Address;
  amount?: string;
  maxAmount?: string;
  tokenId?: string;
  allowNativeValue?: boolean;
  allowUnlimitedApproval?: boolean;
  allowOperatorApproval?: boolean;
  allowEip7702Authorization?: boolean;
  expectedOutcome?: ExpectedTransactionOutcome;
  description?: string;
}

export interface ExpectedTransactionOutcome {
  recipients?: Address[];
  tokenOutflows?: ExpectedAssetOutflow[];
  nftTransfers?: ExpectedNftTransfer[];
  approvals?: ExpectedApproval[];
  allowedSpenders?: Address[];
  allowedOperators?: Address[];
  maxNativeValue?: string;
  maxTokenAmounts?: ExpectedTokenAmountLimit[];
  allowUnknownLogs?: boolean;
}

export interface ExpectedAssetOutflow {
  assetStandard?: "native" | "erc20" | "erc721" | "erc1155" | "unknown";
  tokenAddress?: Address;
  recipient?: Address;
  amount?: string;
  maxAmount?: string;
  tokenId?: string;
}

export interface ExpectedNftTransfer {
  standard?: "erc721" | "erc1155";
  tokenAddress?: Address;
  recipient?: Address;
  tokenId?: string;
  amount?: string;
}

export interface ExpectedApproval {
  standard?: "erc20" | "erc721" | "erc1155" | "unknown";
  tokenAddress?: Address;
  spender?: Address;
  operator?: Address;
  amount?: string;
  maxAmount?: string;
  tokenId?: string;
  approved?: boolean;
}

export interface ExpectedTokenAmountLimit {
  tokenAddress: Address;
  maxAmount: string;
}
