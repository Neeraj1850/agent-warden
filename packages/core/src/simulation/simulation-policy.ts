import type { TransactionIntent } from "../types/intent.types.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type { SimulationResult } from "../types/report.types.js";
import type {
  TokenBalanceDelta,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";
import { areAddressesEqual } from "../utils/validation.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function evaluateSimulationPolicies(
  intent: TransactionIntent,
  transaction: UnsignedEvmTransaction,
  simulationResult: SimulationResult
): PolicyViolation[] {
  return [
    ...executionOutcomeViolations(transaction, simulationResult),
    ...unexpectedOutflowViolations(intent, transaction, simulationResult),
    ...unexpectedApprovalViolations(intent, transaction, simulationResult)
  ];
}

function executionOutcomeViolations(
  transaction: UnsignedEvmTransaction,
  simulationResult: SimulationResult
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (simulationResult.fallbackFrom) {
    violations.push({
      code: "SIMULATION_UNAVAILABLE",
      severity: "medium",
      message: `${simulationResult.fallbackFrom} simulation was unavailable; fallback simulation was used.`,
      expected: "primary simulator available",
      actual: simulationResult.fallbackReason ?? simulationResult.fallbackFrom
    });
  }

  if (simulationResult.status === "unavailable") {
    violations.push({
      code: "SIMULATION_UNAVAILABLE",
      severity: "medium",
      message: "Execution simulation is unavailable.",
      expected: "simulation result",
      actual: simulationResult.revertReason ?? simulationResult.summary
    });
  }

  if (simulationResult.failureCode === "reverted") {
    violations.push({
      code: "SIMULATION_REVERTED",
      severity: "critical",
      message: "Execution simulation reverted on current chain state.",
      expected: "successful simulated execution",
      actual: simulationResult.revertReason ?? "reverted"
    });
  }

  if (simulationResult.failureCode === "chain_mismatch") {
    violations.push({
      code: "SIMULATION_CHAIN_MISMATCH",
      severity: "critical",
      message: "Simulation chain ID does not match the transaction chain ID.",
      expected: transaction.chainId.toString(),
      actual: simulationResult.forkChainId?.toString() ?? "unknown"
    });
  }

  if (simulationResult.failureCode === "state_restore_failed") {
    violations.push({
      code: "SIMULATION_STATE_RESTORE_FAILED",
      severity: "critical",
      message: "Fork simulation failed to restore node state after execution.",
      expected: "evm_revert success",
      actual: simulationResult.revertReason ?? "restore failed"
    });
  }

  if (simulationResult.failureCode === "unsupported") {
    violations.push({
      code: "SIMULATION_UNAVAILABLE",
      severity: "medium",
      message: "The configured simulator does not support this transaction envelope.",
      expected: "supported simulator envelope",
      actual: simulationResult.summary
    });
  }

  return dedupeSimulationViolations(violations);
}

function unexpectedOutflowViolations(
  intent: TransactionIntent,
  transaction: UnsignedEvmTransaction,
  simulationResult: SimulationResult
): PolicyViolation[] {
  const observedDeltas = simulationResult.observedAssetDeltas ?? [];
  const outflows = observedDeltas.filter(
    (delta) =>
      areAddressesEqual(delta.account, transaction.from) && BigInt(delta.delta) < 0n
  );

  if (outflows.length === 0) {
    return [];
  }

  return outflows
    .filter((delta) => !isExpectedOutflow(intent, observedDeltas, delta))
    .map((delta) => ({
      code: "SIMULATION_UNEXPECTED_ASSET_OUTFLOW",
      severity: "critical" as const,
      message: "Simulation observed an asset outflow not covered by intent.",
      expected: describeIntentAsset(intent),
      actual: [
        delta.assetStandard ?? "unknown",
        delta.tokenAddress,
        delta.delta,
        delta.tokenId
      ]
        .filter(Boolean)
        .join(":")
    }));
}

function unexpectedApprovalViolations(
  intent: TransactionIntent,
  transaction: UnsignedEvmTransaction,
  simulationResult: SimulationResult
): PolicyViolation[] {
  return (simulationResult.observedApprovals ?? [])
    .filter((approval) => areAddressesEqual(approval.owner, transaction.from))
    .filter((approval) => !isExpectedApproval(intent, approval))
    .map((approval) => ({
      code: "SIMULATION_UNEXPECTED_APPROVAL",
      severity: "critical" as const,
      message: "Simulation observed an approval not covered by intent.",
      expected: describeIntentApproval(intent),
      actual:
        approval.spender ??
        approval.operator ??
        `${approval.tokenAddress}:${approval.amount ?? approval.tokenId ?? "approval"}`
    }));
}

function isExpectedOutflow(
  intent: TransactionIntent,
  observedDeltas: TokenBalanceDelta[],
  outflow: TokenBalanceDelta
): boolean {
  if (
    !["transfer", "token_transfer", "native_transfer", "nft_transfer", "swap"].includes(
      intent.action
    )
  ) {
    return false;
  }

  if (
    intent.tokenAddress &&
    !areAddressesEqual(outflow.tokenAddress, intent.tokenAddress)
  ) {
    return false;
  }

  if (
    !intent.tokenAddress &&
    outflow.assetStandard !== "native" &&
    outflow.tokenAddress !== ZERO_ADDRESS
  ) {
    return false;
  }

  if (intent.tokenId && outflow.tokenId !== intent.tokenId) {
    return false;
  }

  if (intent.amount && BigInt(outflow.delta) * -1n > BigInt(intent.amount)) {
    return false;
  }

  if (!intent.recipient) {
    return intent.action === "swap";
  }

  return observedDeltas.some(
    (delta) =>
      areAddressesEqual(delta.account, intent.recipient) &&
      areAddressesEqual(delta.tokenAddress, outflow.tokenAddress) &&
      delta.tokenId === outflow.tokenId &&
      BigInt(delta.delta) === BigInt(outflow.delta) * -1n
  );
}

function isExpectedApproval(
  intent: TransactionIntent,
  approval: NonNullable<SimulationResult["observedApprovals"]>[number]
): boolean {
  if (!["approve", "approval"].includes(intent.action)) {
    return false;
  }

  if (
    intent.tokenAddress &&
    !areAddressesEqual(approval.tokenAddress, intent.tokenAddress)
  ) {
    return false;
  }

  if (approval.spender && !areAddressesEqual(approval.spender, intent.spender)) {
    return false;
  }

  if (approval.operator && !areAddressesEqual(approval.operator, intent.spender)) {
    return false;
  }

  if (approval.operator && !intent.allowOperatorApproval) {
    return false;
  }

  if (
    approval.amount &&
    intent.maxAmount &&
    BigInt(approval.amount) > BigInt(intent.maxAmount)
  ) {
    return false;
  }

  if (approval.amount && !intent.maxAmount) {
    return false;
  }

  return approval.approved !== false;
}

function describeIntentAsset(intent: TransactionIntent): string {
  return [
    `action=${intent.action}`,
    ...(intent.tokenAddress ? [`token=${intent.tokenAddress}`] : []),
    ...(intent.recipient ? [`recipient=${intent.recipient}`] : []),
    ...(intent.amount ? [`amount=${intent.amount}`] : []),
    ...(intent.tokenId ? [`tokenId=${intent.tokenId}`] : [])
  ].join(" ");
}

function describeIntentApproval(intent: TransactionIntent): string {
  return [
    `action=${intent.action}`,
    ...(intent.tokenAddress ? [`token=${intent.tokenAddress}`] : []),
    ...(intent.spender ? [`spender=${intent.spender}`] : []),
    ...(intent.maxAmount ? [`maxAmount=${intent.maxAmount}`] : [])
  ].join(" ");
}

function dedupeSimulationViolations(violations: PolicyViolation[]): PolicyViolation[] {
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
