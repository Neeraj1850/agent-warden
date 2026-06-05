import type { Address } from "../types/transaction.types.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type {
  ApprovalFinding,
  DecodedAction,
  DecodedTransaction,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";

export const MAX_UINT256 = (1n << 256n) - 1n;

export function detectApprovalRisks(
  decoded: DecodedTransaction,
  allowUnlimitedApproval = false,
  allowOperatorApproval = false
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const action of decoded.decodedActions ?? []) {
    if (
      action.functionName === "erc20.approve" &&
      action.rawAmount === MAX_UINT256 &&
      !allowUnlimitedApproval
    ) {
      violations.push({
        code: "UNLIMITED_APPROVAL",
        severity: "critical",
        message: "Transaction creates an unlimited ERC-20 allowance.",
        expected: "bounded approval amount",
        actual: action.amount
      });
    }

    if (
      action.functionName === "erc20.approve" &&
      action.rawAmount === MAX_UINT256 &&
      allowUnlimitedApproval
    ) {
      violations.push({
        code: "UNLIMITED_APPROVAL_ALLOWED",
        severity: "medium",
        message: "Intent explicitly allows unlimited approval, but this remains risky.",
        expected: "bounded approval amount preferred",
        actual: action.amount
      });
    }

    if (
      action.actionType.endsWith("_operator_approval") &&
      action.approved !== false &&
      !allowOperatorApproval
    ) {
      violations.push({
        code: "OPERATOR_APPROVAL_FOR_ALL",
        severity: "critical",
        message: "Transaction creates collection-wide operator permissions.",
        expected: "no operator approval or explicit intent allowance",
        actual: action.operator
      });
    }

    if (action.functionName === "erc721.approve") {
      violations.push({
        code: "ERC721_TOKEN_APPROVAL",
        severity: "medium",
        message: "Transaction creates approval over a specific ERC-721 token.",
        expected: "explicit token-specific approval review",
        actual: action.tokenId
      });
    }
  }

  return violations;
}

export function collectApprovalFindings(
  transaction: UnsignedEvmTransaction,
  decoded: DecodedTransaction
): ApprovalFinding[] {
  const owner = transaction.from;

  return (decoded.decodedActions ?? [])
    .map((action) => approvalFindingForAction(owner, action))
    .filter((finding): finding is ApprovalFinding => finding !== undefined);
}

function approvalFindingForAction(
  owner: Address,
  action: DecodedAction
): ApprovalFinding | undefined {
  if (!action.tokenAddress && !action.contractAddress) {
    return undefined;
  }

  const tokenAddress = (action.tokenAddress ?? action.contractAddress)!;

  if (action.functionName === "erc20.approve") {
    return {
      standard: "erc20",
      owner,
      tokenAddress,
      spender: action.spender,
      amount: action.amount,
      isUnlimited: action.rawAmount === MAX_UINT256,
      risk: action.rawAmount === MAX_UINT256 ? "critical" : "medium",
      message:
        action.rawAmount === MAX_UINT256
          ? "Unlimited ERC-20 allowance."
          : "ERC-20 allowance change."
    };
  }

  if (action.functionName === "erc721.approve") {
    return {
      standard: "erc721",
      owner,
      tokenAddress,
      spender: action.spender,
      tokenId: action.tokenId,
      risk: "medium",
      message: "ERC-721 token-specific approval."
    };
  }

  if (action.actionType === "erc721_operator_approval") {
    return {
      standard: "erc721",
      owner,
      tokenAddress,
      operator: action.operator,
      approved: action.approved,
      isOperatorApproval: true,
      risk: action.approved === false ? "low" : "critical",
      message: "ERC-721 collection-wide operator approval."
    };
  }

  if (action.actionType === "erc1155_operator_approval") {
    return {
      standard: "erc1155",
      owner,
      tokenAddress,
      operator: action.operator,
      approved: action.approved,
      isOperatorApproval: true,
      risk: action.approved === false ? "low" : "critical",
      message: "ERC-1155 collection-wide operator approval."
    };
  }

  return undefined;
}
