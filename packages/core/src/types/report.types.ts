import type { TransactionIntent } from "./intent.types.js";
import type { PolicyViolation, Verdict } from "./policy.types.js";
import type {
  ActionType,
  ApprovalFinding,
  DecodedAction,
  DecodedTransaction,
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

export interface SecurityReport {
  requestId?: string;
  verdict: Verdict;
  riskScore: number;
  transactionEnvelope: TransactionEnvelope;
  actionType: ActionType;
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
