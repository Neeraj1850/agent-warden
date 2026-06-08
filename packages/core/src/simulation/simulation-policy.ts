import type { TransactionIntent } from "../types/intent.types.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type { SimulationResult } from "../types/report.types.js";
import type {
  Address,
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
    ...unexpectedLogViolations(intent, simulationResult),
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
    .map((delta) => outflowViolation(intent, observedDeltas, delta))
    .filter((violation): violation is PolicyViolation => violation !== undefined);
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
      code: "APPROVAL_NOT_IN_INTENT",
      severity: "critical" as const,
      message: "Simulation observed an approval not covered by intent.",
      expected: describeIntentApproval(intent),
      actual:
        approval.spender ??
        approval.operator ??
        `${approval.tokenAddress}:${approval.amount ?? approval.tokenId ?? "approval"}`
    }));
}

function unexpectedLogViolations(
  intent: TransactionIntent,
  simulationResult: SimulationResult
): PolicyViolation[] {
  if (intent.expectedOutcome?.allowUnknownLogs === true) {
    return [];
  }

  const logs = simulationResult.logs ?? [];
  if (logs.length === 0) {
    return [];
  }

  const decodedEvidenceCount =
    (simulationResult.observedAssetDeltas?.length ?? 0) +
    (simulationResult.observedApprovals?.length ?? 0);

  if (decodedEvidenceCount > 0) {
    return [];
  }

  return [
    {
      code: "UNEXPECTED_LOG_EVENT",
      severity: "critical",
      message:
        "Simulation emitted log events that are not covered by the expected outcome.",
      expected: "no unknown logs unless intent.expectedOutcome.allowUnknownLogs=true",
      actual: logs
        .map((log) => `${log.address}:${log.topics[0] ?? "no-topic"}`)
        .join(", ")
    }
  ];
}

function outflowViolation(
  intent: TransactionIntent,
  observedDeltas: TokenBalanceDelta[],
  outflow: TokenBalanceDelta
): PolicyViolation | undefined {
  const recipient = recipientForOutflow(observedDeltas, outflow);

  if (exceedsIntentLimit(intent, outflow)) {
    return {
      code: "OUTCOME_EXCEEDS_INTENT",
      severity: "critical",
      message: "Simulation observed an asset outflow above the declared intent limit.",
      expected: describeIntentAsset(intent),
      actual: describeOutflow(outflow, recipient)
    };
  }

  if (isExpectedOutflow(intent, observedDeltas, outflow)) {
    return undefined;
  }

  if (outflow.assetStandard === "erc721" || outflow.assetStandard === "erc1155") {
    return {
      code: "UNEXPECTED_NFT_TRANSFER",
      severity: "critical",
      message: "Simulation observed an NFT transfer not covered by intent.",
      expected: describeIntentAsset(intent),
      actual: describeOutflow(outflow, recipient)
    };
  }

  if (recipient && !isExpectedRecipient(intent, recipient)) {
    return {
      code: "UNEXPECTED_RECIPIENT",
      severity: "critical",
      message: "Simulation observed a recipient not covered by intent.",
      expected: describeExpectedRecipients(intent),
      actual: recipient
    };
  }

  return {
    code: "UNEXPECTED_TOKEN_OUTFLOW",
    severity: "critical",
    message: "Simulation observed a token or native asset outflow not covered by intent.",
    expected: describeIntentAsset(intent),
    actual: describeOutflow(outflow, recipient)
  };
}

function isExpectedOutflow(
  intent: TransactionIntent,
  observedDeltas: TokenBalanceDelta[],
  outflow: TokenBalanceDelta
): boolean {
  if (matchesExplicitExpectedOutflow(intent, observedDeltas, outflow)) {
    return true;
  }

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
  if (matchesExplicitExpectedApproval(intent, approval)) {
    return true;
  }

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

function matchesExplicitExpectedOutflow(
  intent: TransactionIntent,
  observedDeltas: TokenBalanceDelta[],
  outflow: TokenBalanceDelta
): boolean {
  const expectedOutflows = [
    ...(intent.expectedOutcome?.tokenOutflows ?? []),
    ...(intent.expectedOutcome?.nftTransfers ?? []).map((transfer) => ({
      assetStandard: transfer.standard,
      tokenAddress: transfer.tokenAddress,
      recipient: transfer.recipient,
      amount: transfer.amount,
      maxAmount: transfer.amount,
      tokenId: transfer.tokenId
    }))
  ];

  if (expectedOutflows.length === 0) {
    return false;
  }

  const outflowAmount = BigInt(outflow.delta) * -1n;
  const recipient = recipientForOutflow(observedDeltas, outflow);

  return expectedOutflows.some((expected) => {
    if (
      expected.assetStandard &&
      outflow.assetStandard &&
      expected.assetStandard !== outflow.assetStandard
    ) {
      return false;
    }

    if (
      expected.tokenAddress &&
      !areAddressesEqual(expected.tokenAddress, outflow.tokenAddress)
    ) {
      return false;
    }

    if (expected.tokenId && expected.tokenId !== outflow.tokenId) {
      return false;
    }

    if (
      expected.recipient &&
      (!recipient || !areAddressesEqual(expected.recipient, recipient))
    ) {
      return false;
    }

    if (expected.amount && outflowAmount !== BigInt(expected.amount)) {
      return false;
    }

    if (expected.maxAmount && outflowAmount > BigInt(expected.maxAmount)) {
      return false;
    }

    return true;
  });
}

function matchesExplicitExpectedApproval(
  intent: TransactionIntent,
  approval: NonNullable<SimulationResult["observedApprovals"]>[number]
): boolean {
  const approvals = intent.expectedOutcome?.approvals ?? [];

  if (
    (approval.spender &&
      isAddressAllowed(approval.spender, intent.expectedOutcome?.allowedSpenders)) ||
    (approval.operator &&
      isAddressAllowed(approval.operator, intent.expectedOutcome?.allowedOperators))
  ) {
    return approval.approved !== false;
  }

  if (approvals.length === 0) {
    return false;
  }

  return approvals.some((expected) => {
    if (expected.standard && expected.standard !== approval.standard) {
      return false;
    }

    if (
      expected.tokenAddress &&
      !areAddressesEqual(expected.tokenAddress, approval.tokenAddress)
    ) {
      return false;
    }

    if (
      expected.spender &&
      (!approval.spender || !areAddressesEqual(expected.spender, approval.spender))
    ) {
      return false;
    }

    if (
      expected.operator &&
      (!approval.operator || !areAddressesEqual(expected.operator, approval.operator))
    ) {
      return false;
    }

    if (expected.tokenId && expected.tokenId !== approval.tokenId) {
      return false;
    }

    if (expected.amount && approval.amount !== expected.amount) {
      return false;
    }

    if (
      expected.maxAmount &&
      approval.amount &&
      BigInt(approval.amount) > BigInt(expected.maxAmount)
    ) {
      return false;
    }

    if (
      expected.approved !== undefined &&
      approval.approved !== undefined &&
      approval.approved !== expected.approved
    ) {
      return false;
    }

    return approval.approved !== false;
  });
}

function exceedsIntentLimit(
  intent: TransactionIntent,
  outflow: TokenBalanceDelta
): boolean {
  const outflowAmount = BigInt(outflow.delta) * -1n;

  if (
    outflow.assetStandard === "native" &&
    intent.expectedOutcome?.maxNativeValue &&
    outflowAmount > BigInt(intent.expectedOutcome.maxNativeValue)
  ) {
    return true;
  }

  const matchingLimit = intent.expectedOutcome?.maxTokenAmounts?.find((limit) =>
    areAddressesEqual(limit.tokenAddress, outflow.tokenAddress)
  );

  if (matchingLimit && outflowAmount > BigInt(matchingLimit.maxAmount)) {
    return true;
  }

  if (intent.maxAmount && outflowAmount > BigInt(intent.maxAmount)) {
    return true;
  }

  return Boolean(intent.amount && outflowAmount > BigInt(intent.amount));
}

function recipientForOutflow(
  observedDeltas: TokenBalanceDelta[],
  outflow: TokenBalanceDelta
): Address | undefined {
  const amount = BigInt(outflow.delta) * -1n;
  const recipientDelta = observedDeltas.find(
    (delta) =>
      BigInt(delta.delta) === amount &&
      areAddressesEqual(delta.tokenAddress, outflow.tokenAddress) &&
      delta.tokenId === outflow.tokenId
  );

  return recipientDelta?.account;
}

function isExpectedRecipient(intent: TransactionIntent, recipient: Address): boolean {
  const recipients = intent.expectedOutcome?.recipients ?? [];

  if (recipients.some((expected) => areAddressesEqual(expected, recipient))) {
    return true;
  }

  return Boolean(intent.recipient && areAddressesEqual(intent.recipient, recipient));
}

function isAddressAllowed(address: Address, allowed: Address[] | undefined): boolean {
  return Boolean(allowed?.some((candidate) => areAddressesEqual(candidate, address)));
}

function describeIntentAsset(intent: TransactionIntent): string {
  return [
    `action=${intent.action}`,
    ...(intent.tokenAddress ? [`token=${intent.tokenAddress}`] : []),
    ...(intent.recipient ? [`recipient=${intent.recipient}`] : []),
    ...(intent.amount ? [`amount=${intent.amount}`] : []),
    ...(intent.maxAmount ? [`maxAmount=${intent.maxAmount}`] : []),
    ...(intent.tokenId ? [`tokenId=${intent.tokenId}`] : []),
    ...(intent.expectedOutcome ? ["expectedOutcome=present"] : [])
  ].join(" ");
}

function describeIntentApproval(intent: TransactionIntent): string {
  return [
    `action=${intent.action}`,
    ...(intent.tokenAddress ? [`token=${intent.tokenAddress}`] : []),
    ...(intent.spender ? [`spender=${intent.spender}`] : []),
    ...(intent.maxAmount ? [`maxAmount=${intent.maxAmount}`] : []),
    ...(intent.expectedOutcome?.approvals ? ["expectedApprovals=present"] : [])
  ].join(" ");
}

function describeExpectedRecipients(intent: TransactionIntent): string {
  return [
    ...(intent.recipient ? [intent.recipient] : []),
    ...(intent.expectedOutcome?.recipients ?? [])
  ].join(", ");
}

function describeOutflow(
  outflow: TokenBalanceDelta,
  recipient: Address | undefined
): string {
  return [
    outflow.assetStandard ?? "unknown",
    outflow.tokenAddress,
    outflow.delta,
    ...(outflow.tokenId ? [`tokenId=${outflow.tokenId}`] : []),
    ...(recipient ? [`recipient=${recipient}`] : [])
  ].join(":");
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
