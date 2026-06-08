import type { PolicyProfile } from "../types/policy-profile.types.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type { SimulationResult } from "../types/report.types.js";
import type {
  DecodedTransaction,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";
import type { TransactionIntent } from "../types/intent.types.js";
import { areAddressesEqual } from "../utils/validation.js";

export function evaluateProfilePolicies(input: {
  profile: PolicyProfile;
  intent: TransactionIntent;
  transaction: UnsignedEvmTransaction;
  decoded: DecodedTransaction;
  simulationResult: SimulationResult;
}): PolicyViolation[] {
  return [
    ...chainViolations(input),
    ...actionViolations(input),
    ...addressScopeViolations(input),
    ...amountLimitViolations(input),
    ...blockedBehaviorViolations(input),
    ...requiredEvidenceViolations(input)
  ];
}

function chainViolations(input: {
  profile: PolicyProfile;
  transaction: UnsignedEvmTransaction;
}): PolicyViolation[] {
  const allowedChains = input.profile.allowedChains;

  if (!allowedChains?.length || allowedChains.includes(input.transaction.chainId)) {
    return [];
  }

  return [
    {
      code: "PROFILE_CHAIN_NOT_ALLOWED",
      severity: "critical",
      message: "Policy profile does not allow this chain.",
      expected: allowedChains.join(","),
      actual: input.transaction.chainId.toString()
    }
  ];
}

function actionViolations(input: {
  profile: PolicyProfile;
  intent: TransactionIntent;
}): PolicyViolation[] {
  const allowedActions = input.profile.allowedActions;

  if (!allowedActions?.length || allowedActions.includes(input.intent.action)) {
    return [];
  }

  return [
    {
      code: "PROFILE_ACTION_NOT_ALLOWED",
      severity: "critical",
      message: "Policy profile does not allow this requested action.",
      expected: allowedActions.join(","),
      actual: input.intent.action
    }
  ];
}

function addressScopeViolations(input: {
  profile: PolicyProfile;
  intent: TransactionIntent;
  transaction: UnsignedEvmTransaction;
  decoded: DecodedTransaction;
}): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const recipient = input.decoded.recipient ?? input.intent.recipient;
  const token = input.decoded.tokenAddress ?? input.intent.tokenAddress;
  const spender = input.decoded.spender ?? input.intent.spender;
  const operator = input.decoded.operator ?? input.intent.spender;
  const router = input.transaction.to;

  if (
    input.profile.allowedRecipients?.length &&
    recipient &&
    !addressInList(recipient, input.profile.allowedRecipients)
  ) {
    violations.push({
      code: "PROFILE_RECIPIENT_NOT_ALLOWED",
      severity: "critical",
      message: "Policy profile does not allow this recipient.",
      expected: input.profile.allowedRecipients.join(","),
      actual: recipient
    });
  }

  if (
    input.profile.allowedTokens?.length &&
    token &&
    !addressInList(token, input.profile.allowedTokens)
  ) {
    violations.push({
      code: "PROFILE_TOKEN_NOT_ALLOWED",
      severity: "critical",
      message: "Policy profile does not allow this token contract.",
      expected: input.profile.allowedTokens.join(","),
      actual: token
    });
  }

  if (
    input.profile.allowedSpenders?.length &&
    spender &&
    !addressInList(spender, input.profile.allowedSpenders)
  ) {
    violations.push({
      code: "PROFILE_SPENDER_NOT_ALLOWED",
      severity: "critical",
      message: "Policy profile does not allow this spender.",
      expected: input.profile.allowedSpenders.join(","),
      actual: spender
    });
  }

  if (
    input.profile.allowedOperators?.length &&
    operator &&
    !addressInList(operator, input.profile.allowedOperators)
  ) {
    violations.push({
      code: "PROFILE_OPERATOR_NOT_ALLOWED",
      severity: "critical",
      message: "Policy profile does not allow this operator.",
      expected: input.profile.allowedOperators.join(","),
      actual: operator
    });
  }

  if (
    input.profile.allowedRouters?.length &&
    input.decoded.actionType === "swap" &&
    router &&
    !addressInList(router, input.profile.allowedRouters)
  ) {
    violations.push({
      code: "PROFILE_ROUTER_NOT_ALLOWED",
      severity: "critical",
      message: "Policy profile does not allow this router.",
      expected: input.profile.allowedRouters.join(","),
      actual: router
    });
  }

  return violations;
}

function amountLimitViolations(input: {
  profile: PolicyProfile;
  intent: TransactionIntent;
  transaction: UnsignedEvmTransaction;
  decoded: DecodedTransaction;
}): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const nativeValue = BigInt(input.transaction.value ?? "0");

  if (
    input.profile.maxNativeValue &&
    nativeValue > BigInt(input.profile.maxNativeValue)
  ) {
    violations.push({
      code: "PROFILE_NATIVE_VALUE_EXCEEDED",
      severity: "critical",
      message: "Transaction native value exceeds the policy profile limit.",
      expected: input.profile.maxNativeValue,
      actual: input.transaction.value ?? "0"
    });
  }

  const token = input.decoded.tokenAddress ?? input.intent.tokenAddress;
  const amount = input.decoded.amount ?? input.intent.amount;
  const matchingLimit = input.profile.maxTokenAmounts?.find(
    (limit) => token && areAddressesEqual(limit.tokenAddress, token)
  );

  if (matchingLimit && amount && BigInt(amount) > BigInt(matchingLimit.maxAmount)) {
    violations.push({
      code: "PROFILE_TOKEN_AMOUNT_EXCEEDED",
      severity: "critical",
      message: "Transaction token amount exceeds the policy profile limit.",
      expected: matchingLimit.maxAmount,
      actual: amount
    });
  }

  return violations;
}

function blockedBehaviorViolations(input: {
  profile: PolicyProfile;
  decoded: DecodedTransaction;
}): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const actionType = input.decoded.actionType;

  if (input.profile.blockApprovals && actionType?.includes("approval")) {
    violations.push({
      code: "PROFILE_APPROVAL_BLOCKED",
      severity: "critical",
      message: "Policy profile blocks approval transactions.",
      expected: "no approvals",
      actual: actionType
    });
  }

  if (
    input.profile.blockOperatorApprovals &&
    (actionType === "erc721_operator_approval" ||
      actionType === "erc1155_operator_approval")
  ) {
    violations.push({
      code: "PROFILE_OPERATOR_APPROVAL_BLOCKED",
      severity: "critical",
      message: "Policy profile blocks operator approvals.",
      expected: "no operator approvals",
      actual: actionType
    });
  }

  if (input.profile.blockContractDeployments && actionType === "deployment") {
    violations.push({
      code: "PROFILE_DEPLOYMENT_BLOCKED",
      severity: "critical",
      message: "Policy profile blocks contract deployments.",
      expected: "no contract deployments",
      actual: actionType
    });
  }

  if (input.profile.blockUnknownContracts && actionType === "unknown_contract_call") {
    violations.push({
      code: "PROFILE_UNKNOWN_CONTRACT_BLOCKED",
      severity: "critical",
      message: "Policy profile blocks unknown contract calls.",
      expected: "known decoded contract action",
      actual: actionType
    });
  }

  return violations;
}

function requiredEvidenceViolations(input: {
  profile: PolicyProfile;
  intent: TransactionIntent;
  simulationResult: SimulationResult;
}): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (input.profile.requireSimulation && input.simulationResult.status !== "success") {
    violations.push({
      code: "PROFILE_SIMULATION_REQUIRED",
      severity: "critical",
      message: "Policy profile requires successful simulation evidence.",
      expected: "simulation status success",
      actual: input.simulationResult.status
    });
  }

  if (input.profile.requireExpectedOutcome && !input.intent.expectedOutcome) {
    violations.push({
      code: "PROFILE_EXPECTED_OUTCOME_REQUIRED",
      severity: "critical",
      message: "Policy profile requires an explicit expected outcome.",
      expected: "intent.expectedOutcome",
      actual: "missing"
    });
  }

  return violations;
}

function addressInList(address: string, list: string[]): boolean {
  return list.some((candidate) => areAddressesEqual(candidate, address));
}
