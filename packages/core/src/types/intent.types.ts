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
  description?: string;
}
