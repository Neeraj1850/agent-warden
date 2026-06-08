import {
  applyAdditionalPolicyViolations,
  analyzeSignature,
  analyzeTransactionWithSimulation,
  InMemorySessionStore,
  LocalReputationProvider,
  policyViolationsFromReputationSignals,
  evaluateStatePolicies,
  validateAnalysisRequest
} from "@agent-warden/core";
import type {
  AnalysisRequest,
  ChainStateProvider,
  PolicyViolation,
  ReputationProvider,
  SecurityReport,
  SignatureAnalysisRequest,
  SignatureSecurityReport,
  ChainStateSnapshot
} from "@agent-warden/core";
import { ViemChainStateProvider } from "@agent-warden/core";
import type { ApiEnv } from "../config/env.js";

export interface AnalysisService {
  analyzeRequest(request: unknown): Promise<SecurityReport>;
  analyzeSignatureRequest(request: unknown): SignatureSecurityReport;
}

export interface AnalysisServiceOptions {
  sessionStore?: InMemorySessionStore;
  reputationProvider?: ReputationProvider;
  chainStateProvider?: ChainStateProvider;
}

export function createAnalysisService(
  env: Pick<ApiEnv, "analysisRpcUrl" | "analysisRpcTimeoutMs"> = {
    analysisRpcTimeoutMs: 3_000
  },
  options: AnalysisServiceOptions = {}
): AnalysisService {
  const sessionStore = options.sessionStore ?? new InMemorySessionStore();
  const reputationProvider = options.reputationProvider ?? new LocalReputationProvider();
  const chainStateProvider =
    options.chainStateProvider ??
    (env.analysisRpcUrl
      ? new ViemChainStateProvider({
          rpcUrl: env.analysisRpcUrl,
          timeoutMs: env.analysisRpcTimeoutMs
        })
      : undefined);

  return {
    async analyzeRequest(request: unknown): Promise<SecurityReport> {
      const normalizedRequest = validateAnalysisRequest(request);
      const sessionViolations = sessionStore.evaluateTransaction(
        normalizedRequest.transaction.from,
        normalizedRequest.transaction
      );
      const baseReport = await analyzeTransactionWithSimulation(normalizedRequest);
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
    }
  };
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
