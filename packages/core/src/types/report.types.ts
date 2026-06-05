import type { TransactionIntent } from "./intent.types.js";
import type { PolicyViolation, Verdict } from "./policy.types.js";
import type {
  ActionType,
  ApprovalFinding,
  DecodedAction,
  DecodedTransaction,
  ExecutionGraph,
  TokenBalanceDelta,
  TransactionEnvelope,
  UnsignedEvmTransaction
} from "./transaction.types.js";

export interface AnalysisRequest {
  intent: TransactionIntent;
  transaction: UnsignedEvmTransaction;
  requestId?: string;
}

export interface SimulationResult {
  status: "not_run" | "success" | "failed";
  engine: "local-static" | "eth_call" | "anvil" | "tenderly" | "blocksec";
  summary: string;
  balanceDeltas: TokenBalanceDelta[];
  revertReason?: string;
}

export type ReportFindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface ReportFinding {
  code: string;
  title: string;
  severity: ReportFindingSeverity;
  detail: string;
  evidence: string[];
}

export interface RiskVector {
  contractRisk: number;
  tokenRisk: number;
  behaviorRisk: number;
  intentDelta: number;
  sanctionsRisk: number;
  simulationRisk: number;
}

export interface SecurityReport {
  requestId?: string;
  verdict: Verdict;
  riskScore: number;
  riskVector: RiskVector;
  summary: string;
  explanation: string;
  findings: ReportFinding[];
  recommendedAction: string;
  transactionEnvelope: TransactionEnvelope;
  actionType: ActionType;
  executionGraph: ExecutionGraph;
  decodedActions: DecodedAction[];
  assetDeltas: TokenBalanceDelta[];
  approvalFindings: ApprovalFinding[];
  benchmarkProfile?: "agentkit" | "goat" | "eliza" | "generic";
  decodedTransaction: DecodedTransaction;
  policyViolations: PolicyViolation[];
  simulationResult: SimulationResult;
  saferAlternative?: string;
  reportHash: string;
}
