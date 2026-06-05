import { detectApprovalRisks } from "../analyzer/approval-detector.js";
import { matchIntent } from "../analyzer/intent-matcher.js";
import { decideVerdict, scoreRisk } from "../analyzer/risk-scorer.js";
import type { TransactionIntent } from "../types/intent.types.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type { PolicyDecision } from "../types/policy.types.js";
import type {
  DecodedTransaction,
  TransactionEnvelope,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";

export function evaluatePolicies(
  intent: TransactionIntent,
  transaction: UnsignedEvmTransaction,
  decoded: DecodedTransaction,
  envelope?: TransactionEnvelope
): PolicyDecision {
  const violations = [
    ...matchIntent(intent, transaction, decoded),
    ...detectApprovalRisks(
      decoded,
      intent.allowUnlimitedApproval,
      intent.allowOperatorApproval
    ),
    ...detectEnvelopeRisks(intent, envelope),
    ...detectMulticallRisks(decoded)
  ];
  const verdict = decideVerdict(violations);

  return {
    verdict,
    riskScore: scoreRisk(decoded, violations),
    violations,
    saferAlternative: buildSaferAlternative(decoded, violations)
  };
}

function detectEnvelopeRisks(
  intent: TransactionIntent,
  envelope?: TransactionEnvelope
): PolicyViolation[] {
  if (!envelope?.hasAuthorizationList) {
    return [];
  }

  if (intent.allowEip7702Authorization) {
    return [
      {
        code: "EIP7702_AUTHORIZATION_ALLOWED",
        severity: "medium",
        message:
          "Transaction contains an EIP-7702 authorization list, explicitly allowed by intent."
      }
    ];
  }

  return [
    {
      code: "EIP7702_AUTHORIZATION_PRESENT",
      severity: "critical",
      message:
        "Transaction contains an EIP-7702 authorization list that may delegate EOA execution authority.",
      expected: "no authorization list unless explicitly allowed",
      actual: "authorizationList"
    }
  ];
}

function detectMulticallRisks(decoded: DecodedTransaction): PolicyViolation[] {
  if (decoded.actionType !== "multicall") {
    return [];
  }

  const nestedActions = decoded.decodedActions?.slice(1) ?? [];
  const hasNestedApproval = nestedActions.some((action) =>
    action.actionType.includes("approval")
  );
  const hasNestedSwap = nestedActions.some((action) => action.actionType === "swap");

  if (!hasNestedApproval && !hasNestedSwap) {
    return [
      {
        code: "MULTICALL_REQUIRES_SIMULATION",
        severity: "medium",
        message:
          "Multicall detected. V1 static analyzer cannot fully prove every nested call."
      }
    ];
  }

  return [
    {
      code: "SUSPICIOUS_MULTICALL",
      severity: hasNestedApproval ? "critical" : "high",
      message:
        "Multicall contains nested approval or swap selectors that require stricter review."
    }
  ];
}

function buildSaferAlternative(
  decoded: DecodedTransaction,
  violations: PolicyDecision["violations"]
): string | undefined {
  if (violations.some((violation) => violation.code === "UNLIMITED_APPROVAL")) {
    return "Use a bounded approval for the exact intended amount or a short-lived spending allowance.";
  }

  if (violations.some((violation) => violation.code === "OPERATOR_APPROVAL_FOR_ALL")) {
    return "Avoid collection-wide operator approval. Use token-specific approval or execute through a tightly scoped smart account policy.";
  }

  if (violations.some((violation) => violation.code === "SUSPICIOUS_MULTICALL")) {
    return "Split the multicall into individual transactions or simulate and review every nested call before signing.";
  }

  if (
    violations.some((violation) => violation.code === "EIP7702_AUTHORIZATION_PRESENT")
  ) {
    return "Do not sign EIP-7702 authorization-list transactions unless the delegate code and policy are independently verified.";
  }

  if (violations.some((violation) => violation.code.endsWith("_MISMATCH"))) {
    return "Regenerate the transaction from the original structured intent and verify all addresses before signing.";
  }

  if (decoded.functionName === "unknown") {
    return "Route this transaction to a full ABI-aware decoder and simulator before signing.";
  }

  return undefined;
}
