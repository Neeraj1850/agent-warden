import { collectApprovalFindings } from "./approval-detector.js";
import { decodeCalldata } from "./calldata-decoder.js";
import { inferStaticBalanceDeltas } from "./balance-delta-analyzer.js";
import { detectTransactionEnvelope } from "./envelope-detector.js";
import { buildExecutionGraph } from "./execution-graph.js";
import { buildReportNarrative } from "./report-narrative.js";
import { buildRiskVector } from "./risk-scorer.js";
import { evaluatePolicies } from "../policy/policy-engine.js";
import type {
  AnalysisRequest,
  SecurityReport,
  SimulationResult
} from "../types/report.types.js";
import { hashObject } from "../utils/hashing.js";
import { validateAnalysisRequest } from "../utils/validation.js";

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
  options: { rpcUrl?: string; tenderlyRpcUrl?: string } = {}
): Promise<SecurityReport> {
  const normalizedRequest = validateAnalysisRequest(request);
  const decodedTransaction = decodeCalldata(
    normalizedRequest.transaction,
    normalizedRequest.intent
  );
  const tenderlyRpcUrl = options.tenderlyRpcUrl ?? process.env.TENDERLY_RPC_URL;
  const rpcUrl = options.rpcUrl ?? process.env.ANALYSIS_RPC_URL;

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
      staticSimulation(normalizedRequest, decodedTransaction)
    );
  }

  return buildSecurityReport(
    normalizedRequest,
    decodedTransaction,
    await ethCallSimulation(normalizedRequest, rpcUrl, decodedTransaction)
  );
}

function buildSecurityReport(
  request: AnalysisRequest,
  decodedTransaction: ReturnType<typeof decodeCalldata>,
  simulationOverride: SimulationResult
): SecurityReport {
  const transactionEnvelope = detectTransactionEnvelope(request.transaction);
  const assetDeltas = inferStaticBalanceDeltas(request.transaction, decodedTransaction);
  const executionGraph = buildExecutionGraph(request.transaction, decodedTransaction);
  const policyDecision = evaluatePolicies(
    request.intent,
    request.transaction,
    decodedTransaction,
    transactionEnvelope
  );
  const simulationResult: SimulationResult = {
    ...simulationOverride,
    balanceDeltas: simulationOverride.balanceDeltas.length
      ? simulationOverride.balanceDeltas
      : assetDeltas
  };
  const approvalFindings = collectApprovalFindings(
    request.transaction,
    decodedTransaction
  );
  const actionType = decodedTransaction.actionType ?? "unknown_contract_call";
  const narrative = buildReportNarrative({
    verdict: policyDecision.verdict,
    riskScore: policyDecision.riskScore,
    actionType,
    policyViolations: policyDecision.violations,
    approvalFindings,
    simulationResult,
    saferAlternative: policyDecision.saferAlternative
  });

  const reportWithoutHash = {
    requestId: request.requestId,
    verdict: policyDecision.verdict,
    riskScore: policyDecision.riskScore,
    riskVector: buildRiskVector(
      decodedTransaction,
      policyDecision.violations,
      simulationResult
    ),
    ...narrative,
    transactionEnvelope,
    actionType,
    executionGraph,
    decodedActions: decodedTransaction.decodedActions ?? [],
    assetDeltas,
    approvalFindings,
    benchmarkProfile: inferBenchmarkProfile(request),
    decodedTransaction,
    policyViolations: policyDecision.violations,
    simulationResult,
    saferAlternative: policyDecision.saferAlternative
  };

  return {
    ...reportWithoutHash,
    reportHash: hashObject({
      intent: request.intent,
      transaction: request.transaction,
      report: reportWithoutHash
    })
  };
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
            value: toRpcQuantity(request.transaction.value),
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

async function ethCallSimulation(
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
        id: request.requestId ?? "agent-warden-eth-call",
        method: "eth_call",
        params: [
          {
            from: request.transaction.from,
            to: request.transaction.to,
            value: toRpcQuantity(request.transaction.value),
            data: request.transaction.data
          },
          "latest"
        ]
      })
    });
    const body = (await response.json()) as {
      result?: string;
      error?: { message?: string; data?: unknown };
    };

    if (body.error) {
      return {
        status: "failed",
        engine: "eth_call",
        summary: "eth_call simulation reverted or failed.",
        revertReason: body.error.message ?? JSON.stringify(body.error.data),
        balanceDeltas: inferStaticBalanceDeltas(request.transaction, decodedTransaction)
      };
    }

    return {
      status: "success",
      engine: "eth_call",
      summary: "eth_call simulation completed successfully.",
      balanceDeltas: inferStaticBalanceDeltas(request.transaction, decodedTransaction)
    };
  } catch (error) {
    return {
      status: "failed",
      engine: "eth_call",
      summary: "eth_call simulation request failed.",
      revertReason: error instanceof Error ? error.message : "Unknown RPC error",
      balanceDeltas: inferStaticBalanceDeltas(request.transaction, decodedTransaction)
    };
  }
}

function toRpcQuantity(value: string | undefined): `0x${string}` | undefined {
  if (!value || value === "0") {
    return undefined;
  }

  return `0x${BigInt(value).toString(16)}`;
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
