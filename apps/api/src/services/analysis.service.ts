import {
  applyAdditionalPolicyViolations,
  AnvilSimulator,
  analyzeSignature,
  analyzeTransactionWithSimulation,
  EthersChainStateProvider,
  EthCallSimulator,
  explainReport,
  GroqExplainer,
  InMemorySessionStore,
  LocalReputationProvider,
  policyViolationsFromReputationSignals,
  evaluateStatePolicies,
  SafeExplainer,
  StaticSimulator,
  validateAnalysisRequest,
  validateExplainReportRequest
} from "@agent-warden/core";
import type {
  AnalysisRequest,
  ChainStateProvider,
  ExplainReportResponse,
  PolicyViolation,
  ReportExplainer,
  ReputationProvider,
  SecurityReport,
  SignatureAnalysisRequest,
  SignatureSecurityReport,
  ChainStateSnapshot,
  TransactionSimulator
} from "@agent-warden/core";
import type { ApiEnv } from "../config/env.js";

export interface AnalysisService {
  analyzeRequest(request: unknown): Promise<SecurityReport>;
  analyzeSignatureRequest(request: unknown): SignatureSecurityReport;
  explainReportRequest(request: unknown): Promise<ExplainReportResponse>;
}

export interface AnalysisServiceOptions {
  sessionStore?: InMemorySessionStore;
  reputationProvider?: ReputationProvider;
  chainStateProvider?: ChainStateProvider;
  transactionSimulator?: TransactionSimulator;
  reportExplainer?: ReportExplainer;
  fallbackReportExplainer?: ReportExplainer;
}

export function createAnalysisService(
  env: Pick<
    ApiEnv,
    | "analysisRpcUrl"
    | "analysisRpcTimeoutMs"
    | "simulationMode"
    | "anvilRpcUrl"
    | "simulationTimeoutMs"
    | "groqApiKey"
    | "groqModel"
  > = {
    analysisRpcTimeoutMs: 3_000,
    simulationTimeoutMs: 10_000,
    groqModel: "llama-3.1-8b-instant"
  },
  options: AnalysisServiceOptions = {}
): AnalysisService {
  const sessionStore = options.sessionStore ?? new InMemorySessionStore();
  const reputationProvider = options.reputationProvider ?? new LocalReputationProvider();
  const chainStateProvider =
    options.chainStateProvider ?? createDefaultChainStateProvider(env);
  const transactionSimulator =
    options.transactionSimulator ?? createDefaultTransactionSimulator(env);
  const reportExplainer = options.reportExplainer ?? createDefaultReportExplainer(env);
  const fallbackReportExplainer = options.fallbackReportExplainer ?? new SafeExplainer();

  return {
    async analyzeRequest(request: unknown): Promise<SecurityReport> {
      const normalizedRequest = validateAnalysisRequest(request);
      const sessionViolations = sessionStore.evaluateTransaction(
        normalizedRequest.transaction.from,
        normalizedRequest.transaction
      );
      const baseReport = await analyzeTransactionWithSimulation(normalizedRequest, {
        simulator: transactionSimulator
      });
      const reputationViolations = await collectReputationViolations(
        normalizedRequest,
        baseReport,
        reputationProvider
      );
      const stateAnalysis: {
        snapshot?: ChainStateSnapshot;
        violations: PolicyViolation[];
      } = chainStateProvider
        ? await collectStateAnalysis(normalizedRequest, baseReport, chainStateProvider)
        : { violations: [] };
      const report = applyAdditionalPolicyViolations(
        normalizedRequest,
        baseReport,
        [...sessionViolations, ...reputationViolations, ...stateAnalysis.violations],
        {
          stateSnapshot: stateAnalysis.snapshot,
          stateViolations: stateAnalysis.violations
        }
      );

      sessionStore.recordTransaction(normalizedRequest.transaction.from, report);
      return report;
    },

    analyzeSignatureRequest(request: unknown): SignatureSecurityReport {
      const signatureRequest = request as SignatureAnalysisRequest;
      const report = analyzeSignature(signatureRequest);

      sessionStore.recordSignature(signatureRequest.intent.from, report);
      return report;
    },

    async explainReportRequest(request: unknown): Promise<ExplainReportResponse> {
      const explainRequest = validateExplainReportRequest(request);

      return explainReport(
        explainRequest.report,
        reportExplainer,
        fallbackReportExplainer
      );
    }
  };
}

export function createDefaultChainStateProvider(
  env: Pick<ApiEnv, "analysisRpcUrl" | "analysisRpcTimeoutMs">
): ChainStateProvider | undefined {
  if (!env.analysisRpcUrl) {
    return undefined;
  }

  return new EthersChainStateProvider({
    rpcUrl: env.analysisRpcUrl,
    timeoutMs: env.analysisRpcTimeoutMs
  });
}

export function createDefaultTransactionSimulator(
  env: Pick<
    ApiEnv,
    "analysisRpcUrl" | "simulationMode" | "anvilRpcUrl" | "simulationTimeoutMs"
  >
): TransactionSimulator {
  const mode = env.simulationMode ?? (env.analysisRpcUrl ? "eth_call" : "static");

  if (mode === "static") {
    return new StaticSimulator();
  }

  if (mode === "anvil") {
    return new AnvilSimulator({
      rpcUrl: env.anvilRpcUrl,
      timeoutMs: env.simulationTimeoutMs,
      fallbackSimulator: env.analysisRpcUrl
        ? new EthCallSimulator({
            rpcUrl: env.analysisRpcUrl,
            timeoutMs: env.simulationTimeoutMs
          })
        : undefined
    });
  }

  return new EthCallSimulator({
    rpcUrl: env.analysisRpcUrl,
    timeoutMs: env.simulationTimeoutMs
  });
}

export function createDefaultReportExplainer(
  env: Pick<ApiEnv, "groqApiKey" | "groqModel">
): ReportExplainer {
  if (!env.groqApiKey) {
    return new SafeExplainer();
  }

  return new GroqExplainer({
    apiKey: env.groqApiKey,
    model: env.groqModel
  });
}

async function collectReputationViolations(
  request: AnalysisRequest,
  report: SecurityReport,
  reputationProvider: ReputationProvider
): Promise<PolicyViolation[]> {
  const subjects = new Set<string>();
  if (request.transaction.to) {
    subjects.add(request.transaction.to);
  }

  for (const action of report.decodedActions) {
    for (const address of [
      action.contractAddress,
      action.tokenAddress,
      action.recipient,
      action.spender,
      action.operator
    ]) {
      if (address) {
        subjects.add(address);
      }
    }
  }

  const signals = (
    await Promise.all(
      [...subjects].map((subject) => reputationProvider.getSignals(subject))
    )
  ).flat();

  return policyViolationsFromReputationSignals(signals);
}

async function collectStateAnalysis(
  request: AnalysisRequest,
  report: SecurityReport,
  chainStateProvider: ChainStateProvider
) {
  try {
    const snapshot = await chainStateProvider.getSnapshot(request, report);
    return {
      snapshot,
      violations: evaluateStatePolicies(request, report, snapshot)
    };
  } catch (error) {
    const snapshot = {
      chainId: request.transaction.chainId,
      blockTag: "latest" as const,
      account: {
        address: request.transaction.from
      },
      target: request.transaction.to
        ? {
            address: request.transaction.to
          }
        : undefined,
      erc20: [],
      erc721: [],
      erc1155: [],
      lookupErrors: [
        {
          subject: request.transaction.to ?? request.transaction.from,
          operation: "state.snapshot",
          message: error instanceof Error ? error.message : "Unknown state error"
        }
      ]
    };

    return {
      snapshot,
      violations: evaluateStatePolicies(request, report, snapshot)
    };
  }
}

export const defaultAnalysisService = createAnalysisService();
