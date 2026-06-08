import { collectApprovalFindings } from "./approval-detector.js";
import { decodeCalldata } from "./calldata-decoder.js";
import { inferStaticBalanceDeltas } from "./balance-delta-analyzer.js";
import { detectTransactionEnvelope } from "./envelope-detector.js";
import { buildExecutionGraph } from "./execution-graph.js";
import { buildReportNarrative } from "./report-narrative.js";
import { buildRiskVector, decideVerdict, scoreRisk } from "./risk-scorer.js";
import { evaluatePolicies } from "../policy/policy-engine.js";
import { evaluateProfilePolicies } from "../policy/profile-policy.js";
import { resolvePolicyProfile } from "../policy/profile-registry.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type {
  AnalysisRequest,
  ReportFinding,
  SecurityReport,
  SimulationResult
} from "../types/report.types.js";
import type { ChainStateSnapshot } from "../types/state.types.js";
import { hashObject } from "../utils/hashing.js";
import { validateAnalysisRequest } from "../utils/validation.js";
import { EthCallSimulator } from "../simulation/eth-call-simulator.js";
import { StaticSimulator } from "../simulation/static-simulator.js";
import { evaluateSimulationPolicies } from "../simulation/simulation-policy.js";
import { optionalRpcQuantity } from "../simulation/json-rpc-client.js";
import type { TransactionSimulator } from "../simulation/simulator.interface.js";

export interface AnalyzeTransactionWithSimulationOptions {
  rpcUrl?: string;
  tenderlyRpcUrl?: string;
  simulator?: TransactionSimulator;
}

export function analyzeTransaction(request: AnalysisRequest): SecurityReport {
  const normalizedRequest = validateAnalysisRequest(request);
  const decodedTransaction = decodeCalldata(
    normalizedRequest.transaction,
    normalizedRequest.intent
  );
  return buildSecurityReport(
    normalizedRequest,
    decodedTransaction,
    staticSimulation(normalizedRequest, decodedTransaction)
  );
}

export async function analyzeTransactionWithSimulation(
  request: AnalysisRequest,
  options: AnalyzeTransactionWithSimulationOptions = {}
): Promise<SecurityReport> {
  const normalizedRequest = validateAnalysisRequest(request);
  const decodedTransaction = decodeCalldata(
    normalizedRequest.transaction,
    normalizedRequest.intent
  );
  const tenderlyRpcUrl = options.tenderlyRpcUrl ?? process.env.TENDERLY_RPC_URL;
  const rpcUrl = options.rpcUrl ?? process.env.ANALYSIS_RPC_URL;

  if (options.simulator) {
    return buildSecurityReport(
      normalizedRequest,
      decodedTransaction,
      await options.simulator.simulate(normalizedRequest)
    );
  }

  if (tenderlyRpcUrl) {
    return buildSecurityReport(
      normalizedRequest,
      decodedTransaction,
      await tenderlySimulation(normalizedRequest, tenderlyRpcUrl, decodedTransaction)
    );
  }

  if (!rpcUrl) {
    return buildSecurityReport(
      normalizedRequest,
      decodedTransaction,
      await new StaticSimulator().simulate(normalizedRequest)
    );
  }

  return buildSecurityReport(
    normalizedRequest,
    decodedTransaction,
    await new EthCallSimulator({ rpcUrl }).simulate(normalizedRequest)
  );
}

export function applyAdditionalPolicyViolations(
  request: AnalysisRequest,
  report: SecurityReport,
  additionalViolations: PolicyViolation[],
  context: {
    stateSnapshot?: ChainStateSnapshot;
    stateViolations?: PolicyViolation[];
  } = {}
): SecurityReport {
  if (additionalViolations.length === 0 && !context.stateSnapshot) {
    return report;
  }

  const normalizedRequest = validateAnalysisRequest(request);
  const policyViolations = dedupePolicyViolations([
    ...report.policyViolations,
    ...additionalViolations
  ]);
  const verdict = decideVerdict(policyViolations);
  const riskScore = scoreRisk(report.decodedTransaction, policyViolations);
  const narrative = buildReportNarrative({
    verdict,
    riskScore,
    actionType: report.actionType,
    policyViolations,
    approvalFindings: report.approvalFindings,
    simulationResult: report.simulationResult,
    saferAlternative: report.saferAlternative
  });
  const stateFindings = context.stateSnapshot
    ? (context.stateViolations ?? []).map(policyViolationToFinding)
    : report.stateFindings;
  const { reportHash: _previousHash, ...canonicalReport } = {
    ...report,
    verdict,
    riskScore,
    riskVector: buildRiskVector(
      report.decodedTransaction,
      policyViolations,
      report.simulationResult
    ),
    ...narrative,
    policyViolations,
    stateSnapshot: context.stateSnapshot ?? report.stateSnapshot,
    stateFindings
  };

  return {
    ...canonicalReport,
    reportHash: hashObject({
      intent: normalizedRequest.intent,
      transaction: normalizedRequest.transaction,
      profileId: normalizedRequest.profileId,
      policyProfile: normalizedRequest.policyProfile,
      report: canonicalReport
    })
  };
}

function buildSecurityReport(
  request: AnalysisRequest,
  decodedTransaction: ReturnType<typeof decodeCalldata>,
  simulationOverride: SimulationResult
): SecurityReport {
  const transactionEnvelope = detectTransactionEnvelope(request.transaction);
  const assetDeltas = inferStaticBalanceDeltas(request.transaction, decodedTransaction);
  const executionGraph = buildExecutionGraph(request.transaction, decodedTransaction);
  const simulationResult: SimulationResult = {
    ...simulationOverride,
    balanceDeltas: simulationOverride.balanceDeltas.length
      ? simulationOverride.balanceDeltas
      : assetDeltas
  };
  const policyDecision = evaluatePolicies(
    request.intent,
    request.transaction,
    decodedTransaction,
    transactionEnvelope
  );
  const simulationViolations = evaluateSimulationPolicies(
    request.intent,
    request.transaction,
    simulationOverride
  );
  const policyProfile = resolvePolicyProfile(request.profileId, request.policyProfile);
  const profileViolations = evaluateProfilePolicies({
    profile: policyProfile,
    intent: request.intent,
    transaction: request.transaction,
    decoded: decodedTransaction,
    simulationResult
  });
  const policyViolations = dedupePolicyViolations([
    ...policyDecision.violations,
    ...simulationViolations,
    ...profileViolations
  ]);
  const verdict = decideVerdict(policyViolations);
  const riskScore = scoreRisk(decodedTransaction, policyViolations);
  const approvalFindings = collectApprovalFindings(
    request.transaction,
    decodedTransaction
  );
  const actionType = decodedTransaction.actionType ?? "unknown_contract_call";
  const narrative = buildReportNarrative({
    verdict,
    riskScore,
    actionType,
    policyViolations,
    approvalFindings,
    simulationResult,
    saferAlternative: policyDecision.saferAlternative
  });

  const reportWithoutHash = {
    requestId: request.requestId,
    verdict,
    riskScore,
    riskVector: buildRiskVector(decodedTransaction, policyViolations, simulationResult),
    ...narrative,
    transactionEnvelope,
    actionType,
    executionGraph,
    decodedActions: decodedTransaction.decodedActions ?? [],
    assetDeltas,
    approvalFindings,
    benchmarkProfile: inferBenchmarkProfile(request),
    decodedTransaction,
    policyViolations,
    simulationResult,
    saferAlternative: policyDecision.saferAlternative
  };

  return {
    ...reportWithoutHash,
    reportHash: hashObject({
      intent: request.intent,
      transaction: request.transaction,
      profileId: request.profileId,
      policyProfile: request.policyProfile,
      report: reportWithoutHash
    })
  };
}

function dedupePolicyViolations(violations: PolicyViolation[]): PolicyViolation[] {
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

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function staticSimulation(
  request: AnalysisRequest,
  decodedTransaction = decodeCalldata(request.transaction, request.intent)
): SimulationResult {
  return {
    status: "not_run",
    engine: "local-static",
    summary: "Static analysis only. Set ANALYSIS_RPC_URL to run eth_call simulation.",
    balanceDeltas: inferStaticBalanceDeltas(request.transaction, decodedTransaction)
  };
}

async function tenderlySimulation(
  request: AnalysisRequest,
  rpcUrl: string,
  decodedTransaction = decodeCalldata(request.transaction, request.intent)
): Promise<SimulationResult> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: request.requestId ?? "agent-warden-tenderly-sim",
        method: "tenderly_simulateTransaction",
        params: [
          {
            from: request.transaction.from,
            to: request.transaction.to,
            value: optionalRpcQuantity(request.transaction.value),
            input: request.transaction.data,
            gas: "0x1c9c380"
          },
          "latest"
        ]
      })
    });
    const body = (await response.json()) as {
      result?: unknown;
      error?: { message?: string; data?: unknown };
    };

    if (body.error) {
      return {
        status: "failed",
        engine: "tenderly",
        summary: "Tenderly simulation reverted or failed.",
        revertReason: body.error.message ?? JSON.stringify(body.error.data),
        balanceDeltas: inferStaticBalanceDeltas(request.transaction, decodedTransaction)
      };
    }

    return {
      status: "success",
      engine: "tenderly",
      summary: "Tenderly simulation completed successfully.",
      balanceDeltas: inferStaticBalanceDeltas(request.transaction, decodedTransaction)
    };
  } catch (error) {
    return {
      status: "failed",
      engine: "tenderly",
      summary: "Tenderly simulation request failed.",
      revertReason:
        error instanceof Error ? error.message : "Unknown Tenderly simulation error",
      balanceDeltas: inferStaticBalanceDeltas(request.transaction, decodedTransaction)
    };
  }
}

function inferBenchmarkProfile(
  request: AnalysisRequest
): SecurityReport["benchmarkProfile"] {
  const description = request.intent.description?.toLowerCase() ?? "";
  if (description.includes("agentkit")) {
    return "agentkit";
  }

  if (description.includes("goat")) {
    return "goat";
  }

  if (description.includes("eliza")) {
    return "eliza";
  }

  return "generic";
}
