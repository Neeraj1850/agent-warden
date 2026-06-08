import type { PolicyViolation, Verdict } from "../types/policy.types.js";
import type {
  ReportFinding,
  ReportFindingSeverity,
  SimulationResult
} from "../types/report.types.js";
import type { ActionType, ApprovalFinding } from "../types/transaction.types.js";

export function buildReportNarrative(input: {
  verdict: Verdict;
  riskScore: number;
  actionType: ActionType;
  policyViolations: PolicyViolation[];
  approvalFindings: ApprovalFinding[];
  simulationResult: SimulationResult;
  saferAlternative?: string;
}): {
  summary: string;
  explanation: string;
  findings: ReportFinding[];
  recommendedAction: string;
} {
  const riskLabel = riskLabelForScore(input.riskScore);
  const actionLabel = humanAction(input.actionType);
  const findings = [
    ...input.policyViolations.map(policyViolationToFinding),
    ...approvalFindingsToReportFindings(input.approvalFindings),
    ...simulationFindings(input.simulationResult)
  ];
  const uniqueFindings = dedupeFindings(findings);
  const primaryFinding = uniqueFindings[0];

  return {
    summary: `${input.verdict}: ${actionLabel} classified as ${riskLabel} risk.`,
    explanation: buildExplanation({
      actionLabel,
      findingCount: uniqueFindings.length,
      primaryFinding,
      simulationResult: input.simulationResult,
      verdict: input.verdict
    }),
    findings: uniqueFindings,
    recommendedAction: recommendedAction(input)
  };
}

function buildExplanation(input: {
  actionLabel: string;
  findingCount: number;
  primaryFinding?: ReportFinding;
  simulationResult: SimulationResult;
  verdict: Verdict;
}): string {
  if (!input.primaryFinding) {
    return `AgentWarden decoded the transaction as ${input.actionLabel} and found no deterministic policy violations before signing. ${input.simulationResult.summary}`;
  }

  const issueText = input.findingCount === 1 ? "1 issue" : `${input.findingCount} issues`;

  return `AgentWarden decoded the transaction as ${input.actionLabel} and found ${issueText} before signing. Primary finding: ${input.primaryFinding.detail}`;
}

function recommendedAction(input: {
  verdict: Verdict;
  saferAlternative?: string;
}): string {
  if (input.saferAlternative) {
    return input.saferAlternative;
  }

  if (input.verdict === "ALLOW") {
    return "Proceed only if the signer recognizes the recipient, asset, amount, and target contract.";
  }

  if (input.verdict === "WARN") {
    return "Require explicit human or policy confirmation before signing this transaction.";
  }

  return "Do not sign this transaction. Regenerate it from trusted intent or remove the risky operation.";
}

function policyViolationToFinding(violation: PolicyViolation): ReportFinding {
  return {
    code: violation.code,
    title: titleCase(violation.code),
    severity: violation.severity,
    detail: violation.message,
    evidence: [
      ...(violation.expected ? [`expected=${violation.expected}`] : []),
      ...(violation.actual ? [`actual=${violation.actual}`] : [])
    ]
  };
}

function approvalFindingsToReportFindings(
  approvalFindings: ApprovalFinding[]
): ReportFinding[] {
  return approvalFindings.map((approvalFinding) => ({
    code: approvalFindingCode(approvalFinding),
    title: approvalFindingTitle(approvalFinding),
    severity: approvalFinding.risk,
    detail: approvalFinding.message,
    evidence: [
      `standard=${approvalFinding.standard}`,
      `token=${approvalFinding.tokenAddress}`,
      ...(approvalFinding.spender ? [`spender=${approvalFinding.spender}`] : []),
      ...(approvalFinding.operator ? [`operator=${approvalFinding.operator}`] : []),
      ...(approvalFinding.amount ? [`amount=${approvalFinding.amount}`] : []),
      ...(approvalFinding.tokenId ? [`tokenId=${approvalFinding.tokenId}`] : [])
    ]
  }));
}

function simulationFindings(simulationResult: SimulationResult): ReportFinding[] {
  if (simulationResult.status === "unavailable" || simulationResult.fallbackFrom) {
    return [
      {
        code: "SIMULATION_UNAVAILABLE",
        title: "Simulation Unavailable",
        severity: "medium",
        detail:
          simulationResult.fallbackReason ??
          simulationResult.revertReason ??
          simulationResult.summary,
        evidence: [
          `engine=${simulationResult.engine}`,
          ...(simulationResult.fallbackFrom
            ? [`fallbackFrom=${simulationResult.fallbackFrom}`]
            : [])
        ]
      }
    ];
  }

  if (simulationResult.status !== "failed") {
    return [];
  }

  return [
    {
      code: "SIMULATION_FAILED",
      title: "Simulation Failed",
      severity: simulationResult.failureCode === "reverted" ? "critical" : "medium",
      detail: simulationResult.revertReason
        ? `Execution simulation failed: ${simulationResult.revertReason}`
        : "Execution simulation failed without a revert reason.",
      evidence: [
        `engine=${simulationResult.engine}`,
        ...(simulationResult.failureCode
          ? [`failureCode=${simulationResult.failureCode}`]
          : [])
      ]
    }
  ];
}

function approvalFindingCode(finding: ApprovalFinding): string {
  if (finding.isOperatorApproval) {
    return `APPROVAL_${finding.standard.toUpperCase()}_OPERATOR`;
  }

  if (finding.isUnlimited) {
    return `APPROVAL_${finding.standard.toUpperCase()}_UNLIMITED`;
  }

  return `APPROVAL_${finding.standard.toUpperCase()}`;
}

function approvalFindingTitle(finding: ApprovalFinding): string {
  if (finding.isOperatorApproval) {
    return `${finding.standard.toUpperCase()} operator approval`;
  }

  if (finding.isUnlimited) {
    return `${finding.standard.toUpperCase()} unlimited approval`;
  }

  return `${finding.standard.toUpperCase()} approval`;
}

function dedupeFindings(findings: ReportFinding[]): ReportFinding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.detail}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function riskLabelForScore(score: number): ReportFindingSeverity {
  if (score >= 90) {
    return "critical";
  }

  if (score >= 70) {
    return "high";
  }

  if (score >= 40) {
    return "medium";
  }

  if (score > 0) {
    return "low";
  }

  return "info";
}

function humanAction(actionType: ActionType): string {
  return actionType.replaceAll("_", " ");
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
