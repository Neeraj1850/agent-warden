import type { PolicyViolation } from "../types/policy.types.js";
import type { SecurityReport, AnalysisRequest } from "../types/report.types.js";
import type { ChainStateSnapshot } from "../types/state.types.js";
import type { Address } from "../types/transaction.types.js";
import { areAddressesEqual } from "../utils/validation.js";

const MAX_UINT256 = (1n << 256n) - 1n;
const DANGEROUS_ALLOWANCE_THRESHOLD = MAX_UINT256 / 2n;

export function evaluateStatePolicies(
  request: AnalysisRequest,
  report: SecurityReport,
  snapshot: ChainStateSnapshot
): PolicyViolation[] {
  return dedupeViolations([
    ...lookupFailureViolations(snapshot),
    ...nativeBalanceViolations(request, report, snapshot),
    ...targetCodeViolations(request, report, snapshot),
    ...erc20StateViolations(report, snapshot),
    ...erc721StateViolations(request, report, snapshot),
    ...erc1155StateViolations(report, snapshot)
  ]);
}

function lookupFailureViolations(snapshot: ChainStateSnapshot): PolicyViolation[] {
  return snapshot.lookupErrors.map((error) => ({
    code: "STATE_LOOKUP_FAILED",
    severity: "medium",
    message: "Live chain state lookup failed before signing.",
    expected: `${error.operation} succeeds`,
    actual: `${error.subject}: ${error.message}`
  }));
}

function nativeBalanceViolations(
  request: AnalysisRequest,
  report: SecurityReport,
  snapshot: ChainStateSnapshot
): PolicyViolation[] {
  const value = BigInt(request.transaction.value ?? "0");
  const balance = snapshot.account.nativeBalance
    ? BigInt(snapshot.account.nativeBalance)
    : undefined;

  if (balance !== undefined && value > balance) {
    return [
      {
        code: "INSUFFICIENT_NATIVE_BALANCE",
        severity: "critical",
        message: "Signer does not have enough native balance for this transaction value.",
        expected: `native balance >= ${value}`,
        actual: snapshot.account.nativeBalance
      }
    ];
  }

  const sendsNativeToContract =
    report.actionType === "native_transfer" && snapshot.target?.isContract === true;
  if (sendsNativeToContract) {
    return [
      {
        code: "TARGET_IS_CONTRACT",
        severity: "medium",
        message: "Native transfer recipient has contract bytecode.",
        expected: "EOA recipient unless explicitly intended",
        actual: snapshot.target?.address
      }
    ];
  }

  return [];
}

function targetCodeViolations(
  _request: AnalysisRequest,
  report: SecurityReport,
  snapshot: ChainStateSnapshot
): PolicyViolation[] {
  if (
    report.actionType === "native_transfer" ||
    report.actionType === "deployment" ||
    !snapshot.target ||
    snapshot.target.isContract !== false
  ) {
    return [];
  }

  return [
    {
      code: "TARGET_HAS_NO_CODE",
      severity: "critical",
      message: "Transaction target has no contract bytecode for a contract action.",
      expected: "contract bytecode at target",
      actual: snapshot.target.address
    }
  ];
}

function erc20StateViolations(
  report: SecurityReport,
  snapshot: ChainStateSnapshot
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const action of report.decodedActions) {
    if (action.actionType === "erc20_transfer" && action.amount) {
      const tokenState = findErc20State(snapshot, action.tokenAddress);
      if (
        tokenState?.balance !== undefined &&
        BigInt(tokenState.balance) < BigInt(action.amount)
      ) {
        violations.push({
          code: "INSUFFICIENT_TOKEN_BALANCE",
          severity: "critical",
          message: "Signer does not have enough token balance for this transfer.",
          expected: `token balance >= ${action.amount}`,
          actual: tokenState.balance
        });
      }
    }

    if (action.actionType === "erc20_approval") {
      const tokenState = findErc20State(snapshot, action.tokenAddress, action.spender);
      if (tokenState?.allowance === undefined) {
        continue;
      }

      const allowance = BigInt(tokenState.allowance);
      if (allowance > DANGEROUS_ALLOWANCE_THRESHOLD) {
        violations.push({
          code: "ALLOWANCE_ALREADY_DANGEROUS",
          severity: "critical",
          message: "Signer already has a dangerous allowance for this spender.",
          expected: "existing allowance is bounded or zero",
          actual: `${tokenState.spender}:${tokenState.allowance}`
        });
      } else if (allowance > 0n) {
        violations.push({
          code: "EXISTING_ALLOWANCE_PRESENT",
          severity: "medium",
          message: "Signer already has an existing ERC-20 allowance for this spender.",
          expected: "existing allowance is zero before a new approval",
          actual: `${tokenState.spender}:${tokenState.allowance}`
        });
      }
    }
  }

  return violations;
}

function erc721StateViolations(
  request: AnalysisRequest,
  report: SecurityReport,
  snapshot: ChainStateSnapshot
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const action of report.decodedActions) {
    if (action.actionType === "erc721_transfer") {
      const state = findErc721State(snapshot, action.tokenAddress, action.tokenId);
      if (state?.ownerOf && !areAddressesEqual(state.ownerOf, request.transaction.from)) {
        violations.push({
          code: "NFT_OWNER_MISMATCH",
          severity: "critical",
          message: "Signer does not own the ERC-721 token being transferred.",
          expected: request.transaction.from,
          actual: state.ownerOf
        });
      }
    }

    if (action.actionType === "erc721_approval") {
      const state = findErc721State(snapshot, action.tokenAddress, action.tokenId);
      if (state?.approved && !isZeroAddress(state.approved)) {
        violations.push({
          code: "NFT_TOKEN_ALREADY_APPROVED",
          severity: "critical",
          message: "ERC-721 token already has an approved spender.",
          expected: "no existing token approval",
          actual: state.approved
        });
      }
    }

    if (action.actionType === "erc721_operator_approval") {
      const state = findErc721State(
        snapshot,
        action.tokenAddress,
        undefined,
        action.operator
      );
      if (state?.isApprovedForAll) {
        violations.push({
          code: "NFT_OPERATOR_ALREADY_APPROVED",
          severity: "critical",
          message: "ERC-721 operator is already approved for all tokens.",
          expected: "operator approval is false",
          actual: action.operator
        });
      }
    }
  }

  return violations;
}

function erc1155StateViolations(
  report: SecurityReport,
  snapshot: ChainStateSnapshot
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const action of report.decodedActions) {
    if (action.actionType === "erc1155_transfer" && action.amount) {
      const state = findErc1155State(snapshot, action.tokenAddress, action.tokenId);
      if (state?.balance !== undefined && BigInt(state.balance) < BigInt(action.amount)) {
        violations.push({
          code: "INSUFFICIENT_TOKEN_BALANCE",
          severity: "critical",
          message: "Signer does not have enough ERC-1155 balance for this transfer.",
          expected: `token balance >= ${action.amount}`,
          actual: state.balance
        });
      }
    }

    if (action.actionType === "erc1155_operator_approval") {
      const state = findErc1155State(
        snapshot,
        action.tokenAddress,
        undefined,
        action.operator
      );
      if (state?.isApprovedForAll) {
        violations.push({
          code: "NFT_OPERATOR_ALREADY_APPROVED",
          severity: "critical",
          message: "ERC-1155 operator is already approved for all tokens.",
          expected: "operator approval is false",
          actual: action.operator
        });
      }
    }
  }

  return violations;
}

function findErc20State(
  snapshot: ChainStateSnapshot,
  tokenAddress?: Address,
  spender?: Address
) {
  return snapshot.erc20.find(
    (state) =>
      areAddressesEqual(state.tokenAddress, tokenAddress) &&
      (!spender || areAddressesEqual(state.spender, spender))
  );
}

function findErc721State(
  snapshot: ChainStateSnapshot,
  tokenAddress?: Address,
  tokenId?: string,
  operator?: Address
) {
  return snapshot.erc721.find(
    (state) =>
      areAddressesEqual(state.tokenAddress, tokenAddress) &&
      (tokenId === undefined || state.tokenId === tokenId) &&
      (!operator || areAddressesEqual(state.operator, operator))
  );
}

function findErc1155State(
  snapshot: ChainStateSnapshot,
  tokenAddress?: Address,
  tokenId?: string,
  operator?: Address
) {
  return snapshot.erc1155.find(
    (state) =>
      areAddressesEqual(state.tokenAddress, tokenAddress) &&
      (tokenId === undefined || state.tokenId === tokenId) &&
      (!operator || areAddressesEqual(state.operator, operator))
  );
}

function isZeroAddress(address: Address): boolean {
  return address.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

function dedupeViolations(violations: PolicyViolation[]): PolicyViolation[] {
  const seen = new Set<string>();

  return violations.filter((violation) => {
    const key = `${violation.code}:${violation.actual ?? ""}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
