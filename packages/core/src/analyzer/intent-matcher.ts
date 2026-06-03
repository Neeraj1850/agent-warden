import type { TransactionIntent } from "../types/intent.types.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type {
  DecodedTransaction,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";
import {
  areAddressesEqual,
  parseAmount
} from "../utils/validation.js";

export function matchIntent(
  intent: TransactionIntent,
  transaction: UnsignedEvmTransaction,
  decoded: DecodedTransaction
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (intent.chainId !== transaction.chainId) {
    violations.push({
      code: "CHAIN_MISMATCH",
      severity: "critical",
      message: "Transaction chain does not match the declared intent chain.",
      expected: String(intent.chainId),
      actual: String(transaction.chainId)
    });
  }

  if (!areAddressesEqual(intent.from, transaction.from)) {
    violations.push({
      code: "SENDER_MISMATCH",
      severity: "critical",
      message: "Transaction sender does not match the declared intent sender.",
      expected: intent.from,
      actual: transaction.from
    });
  }

  if (intent.tokenAddress && decoded.tokenAddress && !areAddressesEqual(intent.tokenAddress, decoded.tokenAddress)) {
    violations.push({
      code: "TOKEN_MISMATCH",
      severity: "high",
      message: "Transaction token contract does not match the declared intent token.",
      expected: intent.tokenAddress,
      actual: decoded.tokenAddress
    });
  }

  if (!intent.allowNativeValue && BigInt(transaction.value ?? "0") > 0n && decoded.functionName !== "native.transfer") {
    violations.push({
      code: "UNEXPECTED_NATIVE_VALUE",
      severity: "high",
      message: "Transaction includes native value but intent did not explicitly allow it.",
      expected: "0",
      actual: transaction.value ?? "0"
    });
  }

  if (decoded.functionName === "unknown") {
    violations.push({
      code: "UNKNOWN_FUNCTION_SELECTOR",
      severity: "high",
      message: "Calldata selector is unsupported by the MVP decoder.",
      actual: decoded.selector
    });
    return violations;
  }

  if (
    (intent.action === "transfer" || intent.action === "token_transfer") &&
    decoded.actionType !== "erc20_transfer"
  ) {
    violations.push({
      code: "ACTION_MISMATCH",
      severity: "high",
      message: "Intent expects a transfer, but transaction performs a different action.",
      expected: "erc20_transfer",
      actual: decoded.actionType ?? decoded.functionName
    });
  }

  if (
    (intent.action === "approve" || intent.action === "approval") &&
    !decoded.actionType?.includes("approval")
  ) {
    violations.push({
      code: "ACTION_MISMATCH",
      severity: "high",
      message: "Intent expects an approval, but transaction performs a different action.",
      expected: "approval",
      actual: decoded.actionType ?? decoded.functionName
    });
  }

  if (intent.action === "native_transfer" && decoded.actionType !== "native_transfer") {
    violations.push({
      code: "ACTION_MISMATCH",
      severity: "high",
      message: "Intent expects a native transfer, but transaction performs a different action.",
      expected: "native_transfer",
      actual: decoded.actionType ?? decoded.functionName
    });
  }

  if (intent.action === "nft_transfer" && !decoded.actionType?.startsWith("erc721") && !decoded.actionType?.startsWith("erc1155")) {
    violations.push({
      code: "ACTION_MISMATCH",
      severity: "high",
      message: "Intent expects an NFT transfer, but transaction performs a different action.",
      expected: "nft_transfer",
      actual: decoded.actionType ?? decoded.functionName
    });
  }

  if (intent.action === "swap" && decoded.actionType !== "swap") {
    violations.push({
      code: "ACTION_MISMATCH",
      severity: "high",
      message: "Intent expects a swap, but transaction performs a different action.",
      expected: "swap",
      actual: decoded.actionType ?? decoded.functionName
    });
  }

  if (intent.action === "multicall" && decoded.actionType !== "multicall") {
    violations.push({
      code: "ACTION_MISMATCH",
      severity: "high",
      message: "Intent expects a multicall, but transaction performs a different action.",
      expected: "multicall",
      actual: decoded.actionType ?? decoded.functionName
    });
  }

  if (intent.action === "deployment" && decoded.actionType !== "deployment") {
    violations.push({
      code: "ACTION_MISMATCH",
      severity: "high",
      message: "Intent expects a contract deployment, but transaction performs a different action.",
      expected: "deployment",
      actual: decoded.actionType ?? decoded.functionName
    });
  }

  if (
    decoded.actionType === "erc20_transfer" ||
    decoded.actionType === "erc721_transfer" ||
    decoded.actionType === "erc1155_transfer" ||
    decoded.actionType === "native_transfer"
  ) {
    matchTransferIntent(intent, decoded, violations);
  }

  if (decoded.actionType?.includes("approval")) {
    matchApprovalIntent(intent, decoded, violations);
  }

  matchAmount(intent, decoded, violations);

  return violations;
}

function matchTransferIntent(
  intent: TransactionIntent,
  decoded: DecodedTransaction,
  violations: PolicyViolation[]
): void {
  if (intent.recipient && decoded.recipient && !areAddressesEqual(intent.recipient, decoded.recipient)) {
    violations.push({
      code: "RECIPIENT_MISMATCH",
      severity: "critical",
      message: "Transfer recipient does not match the declared intent recipient.",
      expected: intent.recipient,
      actual: decoded.recipient
    });
  }
}

function matchApprovalIntent(
  intent: TransactionIntent,
  decoded: DecodedTransaction,
  violations: PolicyViolation[]
): void {
  if (intent.spender && decoded.spender && !areAddressesEqual(intent.spender, decoded.spender)) {
    violations.push({
      code: "SPENDER_MISMATCH",
      severity: "critical",
      message: "Approval spender does not match the declared intent spender.",
      expected: intent.spender,
      actual: decoded.spender
    });
  }

  if (intent.spender && decoded.operator && !areAddressesEqual(intent.spender, decoded.operator)) {
    violations.push({
      code: "OPERATOR_MISMATCH",
      severity: "critical",
      message: "Approval operator does not match the declared intent spender/operator.",
      expected: intent.spender,
      actual: decoded.operator
    });
  }
}

function matchAmount(
  intent: TransactionIntent,
  decoded: DecodedTransaction,
  violations: PolicyViolation[]
): void {
  if (decoded.rawAmount === undefined) {
    if (intent.tokenId && decoded.tokenId && intent.tokenId !== decoded.tokenId) {
      violations.push({
        code: "TOKEN_ID_MISMATCH",
        severity: "high",
        message: "NFT token ID does not match the declared intent token ID.",
        expected: intent.tokenId,
        actual: decoded.tokenId
      });
    }
    return;
  }

  const exactAmount = parseAmount(intent.amount);
  const maxAmount = parseAmount(intent.maxAmount);

  if (exactAmount !== undefined && decoded.rawAmount !== exactAmount) {
    violations.push({
      code: "AMOUNT_MISMATCH",
      severity: "high",
      message: "Transaction amount does not match the declared exact amount.",
      expected: exactAmount.toString(),
      actual: decoded.rawAmount.toString()
    });
  }

  if (maxAmount !== undefined && decoded.rawAmount > maxAmount) {
    violations.push({
      code: "AMOUNT_EXCEEDS_MAX",
      severity: "high",
      message: "Transaction amount exceeds the declared maximum amount.",
      expected: maxAmount.toString(),
      actual: decoded.rawAmount.toString()
    });
  }
}
