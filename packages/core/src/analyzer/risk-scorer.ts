import type { PolicyViolation, Verdict } from "../types/policy.types.js";
import type { RiskVector, SimulationResult } from "../types/report.types.js";
import type { DecodedTransaction } from "../types/transaction.types.js";

const SEVERITY_WEIGHTS = {
  low: 5,
  medium: 20,
  high: 45,
  critical: 80
} as const;

export function scoreRisk(
  decoded: DecodedTransaction,
  violations: PolicyViolation[]
): number {
  const baseRisk = baseRiskForAction(decoded);
  const violationRisk = violations.reduce(
    (total, violation) => total + SEVERITY_WEIGHTS[violation.severity],
    0
  );

  return Math.min(100, baseRisk + violationRisk);
}

function baseRiskForAction(decoded: DecodedTransaction): number {
  if (decoded.actionType === "swap" || decoded.actionType === "multicall") {
    return 25;
  }

  if (decoded.actionType?.includes("approval")) {
    return 15;
  }

  if (
    decoded.actionType === "deployment" ||
    decoded.actionType === "unknown_contract_call"
  ) {
    return 35;
  }

  return 5;
}

export function decideVerdict(violations: PolicyViolation[]): Verdict {
  if (
    violations.some(
      (violation) => violation.severity === "critical" || violation.severity === "high"
    )
  ) {
    return "BLOCK";
  }

  if (
    violations.some(
      (violation) => violation.severity === "medium" || violation.severity === "low"
    )
  ) {
    return "WARN";
  }

  return "ALLOW";
}

export function buildRiskVector(
  decoded: DecodedTransaction,
  violations: PolicyViolation[],
  simulationResult?: SimulationResult
): RiskVector {
  return {
    contractRisk: contractRisk(decoded, violations),
    tokenRisk: tokenRisk(violations),
    behaviorRisk: behaviorRisk(decoded, violations),
    intentDelta: intentDeltaRisk(violations),
    sanctionsRisk: sanctionsRisk(violations),
    simulationRisk: simulationRisk(simulationResult)
  };
}

function contractRisk(
  decoded: DecodedTransaction,
  violations: PolicyViolation[]
): number {
  if (violations.some((violation) => violation.code === "UNKNOWN_FUNCTION_SELECTOR")) {
    return 80;
  }

  if (
    decoded.actionType === "deployment" ||
    decoded.actionType === "unknown_contract_call"
  ) {
    return 35;
  }

  return 5;
}

function tokenRisk(violations: PolicyViolation[]): number {
  if (
    violations.some((violation) =>
      ["UNLIMITED_APPROVAL", "OPERATOR_APPROVAL_FOR_ALL"].includes(violation.code)
    )
  ) {
    return 90;
  }

  return 5;
}

function behaviorRisk(
  decoded: DecodedTransaction,
  violations: PolicyViolation[]
): number {
  if (
    violations.some((violation) =>
      [
        "PERMIT_SIGNATURE_APPROVAL",
        "EIP4337_USEROP_REQUIRES_RECURSIVE_REVIEW",
        "SUSPICIOUS_MULTICALL",
        "EIP7702_AUTHORIZATION_PRESENT"
      ].includes(violation.code)
    )
  ) {
    return 95;
  }

  if (decoded.actionType === "swap" || decoded.actionType === "multicall") {
    return 45;
  }

  return 5;
}

function intentDeltaRisk(violations: PolicyViolation[]): number {
  if (violations.some((violation) => violation.code.endsWith("_MISMATCH"))) {
    return 90;
  }

  if (violations.some((violation) => violation.code === "UNEXPECTED_NATIVE_VALUE")) {
    return 70;
  }

  return 0;
}

function sanctionsRisk(violations: PolicyViolation[]): number {
  if (violations.some((violation) => violation.code === "SANCTIONS_MATCH")) {
    return 100;
  }

  return 0;
}

function simulationRisk(simulationResult?: SimulationResult): number {
  if (simulationResult?.status === "failed") {
    return 50;
  }

  if (simulationResult?.status === "unavailable") {
    return 20;
  }

  return 0;
}
