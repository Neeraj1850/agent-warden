import type { TransactionIntent } from "./intent.types.js";
import type { PolicyProfile } from "./policy-profile.types.js";
import type { PolicyViolation, Verdict } from "./policy.types.js";
import type { ChainStateSnapshot } from "./state.types.js";
import type {
  ActionType,
  ApprovalFinding,
  Address,
  DecodedAction,
  DecodedTransaction,
  ExecutionGraph,
  Hex,
  TokenBalanceDelta,
  TransactionEnvelope,
  UnsignedEvmTransaction
} from "./transaction.types.js";

export interface AnalysisRequest {
  intent: TransactionIntent;
  transaction: UnsignedEvmTransaction;
  requestId?: string;
  profileId?: string;
  policyProfile?: PolicyProfile;
}

export type SimulationStatus = "not_run" | "success" | "failed" | "unavailable";

export type SimulationFailureCode =
  | "reverted"
  | "chain_mismatch"
  | "unavailable"
  | "unsupported"
  | "state_restore_failed";

export type SimulationEngine =
  | "local-static"
  | "eth_call"
  | "anvil"
  | "tenderly"
  | "blocksec";

export interface SimulationLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}

export interface ObservedApproval {
  standard: "erc20" | "erc721" | "erc1155" | "unknown";
  owner: Address;
  tokenAddress: Address;
  spender?: Address;
  operator?: Address;
  amount?: string;
  tokenId?: string;
  approved?: boolean;
}

export interface SimulationResult {
  status: SimulationStatus;
  engine: SimulationEngine;
  summary: string;
  balanceDeltas: TokenBalanceDelta[];
  failureCode?: SimulationFailureCode;
  revertReason?: string;
  gasUsed?: string;
  blockNumber?: number;
  logs?: SimulationLog[];
  observedAssetDeltas?: TokenBalanceDelta[];
  observedApprovals?: ObservedApproval[];
  forkChainId?: number;
  fallbackFrom?: SimulationEngine;
  fallbackReason?: string;
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
  stateSnapshot?: ChainStateSnapshot;
  stateFindings?: ReportFinding[];
  saferAlternative?: string;
  reportHash: string;
}

export interface ExplainReportRequest {
  report: SecurityReport;
}

export interface ExplainReportResponse {
  verdict: Verdict;
  riskScore: number;
  reportHash: string;
  model: string;
  explanation: string;
  safetyNotice: string;
}
