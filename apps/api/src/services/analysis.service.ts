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
  validateExplainReportRequest,
  verifyReportHash
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
  TransactionSimulator,
  VerifyReportRequest,
  VerifyReportResponse
} from "@agent-warden/core";
import type { ApiEnv } from "../config/env.js";
import {
  FileReportStore,
  type ReportStore,
  type StoredReport
} from "./report-store.service.js";

export interface AnalysisService {
  analyzeRequest(request: unknown): Promise<SecurityReport>;
  analyzeSignatureRequest(request: unknown): Promise<SignatureSecurityReport>;
  explainReportRequest(request: unknown): Promise<ExplainReportResponse>;
  getReport(reportHash: string): Promise<StoredReport | undefined>;
  verifyReportRequest(request: unknown): VerifyReportResponse;
}

export interface AnalysisServiceOptions {
  sessionStore?: InMemorySessionStore;
  reputationProvider?: ReputationProvider;
  chainStateProvider?: ChainStateProvider;
  transactionSimulator?: TransactionSimulator;
  reportExplainer?: ReportExplainer;
  fallbackReportExplainer?: ReportExplainer;
  reportStore?: ReportStore;
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
    | "reportStoreDir"
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
  const reportStore =
    options.reportStore ??
    (env.reportStoreDir ? new FileReportStore(env.reportStoreDir) : undefined);

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
      await persistReport(reportStore, report);
      return report;
    },

    async analyzeSignatureRequest(request: unknown): Promise<SignatureSecurityReport> {
      const signatureRequest = request as SignatureAnalysisRequest;
      const report = analyzeSignature(signatureRequest);

      sessionStore.recordSignature(signatureRequest.intent.from, report);
      await persistReport(reportStore, report);
      return report;
    },

    async explainReportRequest(request: unknown): Promise<ExplainReportResponse> {
      const explainRequest = validateExplainReportRequest(request);

      return explainReport(
        explainRequest.report,
        reportExplainer,
        fallbackReportExplainer
      );
    },

    async getReport(reportHash: string): Promise<StoredReport | undefined> {
      return reportStore?.get(reportHash);
    },

    verifyReportRequest(request: unknown): VerifyReportResponse {
      return verifyReportHash(validateVerifyReportRequest(request));
    }
  };
}

function validateVerifyReportRequest(input: unknown): VerifyReportRequest {
  const reportHashPattern = /^0x[a-f0-9]{64}$/;

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Expected verify report request to be an object");
  }

  const request = input as Record<string, unknown>;

  if (request.kind !== "transaction" && request.kind !== "signature") {
    throw new Error("Expected kind to be transaction or signature");
  }

  if (!request.request || typeof request.request !== "object") {
    throw new Error("Expected request to be an object");
  }

  if (!request.report || typeof request.report !== "object") {
    throw new Error("Expected report to be an object");
  }

  const report = request.report as Record<string, unknown>;
  if (
    typeof report.reportHash !== "string" ||
    !reportHashPattern.test(report.reportHash)
  ) {
    throw new Error("Expected report.reportHash to be a 0x-prefixed 32-byte hash");
  }

  return request as unknown as VerifyReportRequest;
}

class ReportPersistenceError extends Error {
  readonly statusCode = 500;

  constructor(error: unknown) {
    super(
      `Report persistence failed: ${
        error instanceof Error ? error.message : "Unknown storage error"
      }`
    );
    this.name = "ReportPersistenceError";
  }
}

async function persistReport(
  reportStore: ReportStore | undefined,
  report: StoredReport
): Promise<void> {
  if (!reportStore) {
    return;
  }

  try {
    await reportStore.save(report);
  } catch (error) {
    throw new ReportPersistenceError(error);
  }
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
