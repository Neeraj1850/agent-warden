import {
  analyzeSignature,
  analyzeTransactionWithSimulation,
  validateAnalysisRequest
} from "@agent-warden/core";
import type { SecurityReport, SignatureSecurityReport } from "@agent-warden/types";

export async function analyzeRequest(request: unknown): Promise<SecurityReport> {
  return analyzeTransactionWithSimulation(validateAnalysisRequest(request));
}

export function analyzeSignatureRequest(request: unknown): SignatureSecurityReport {
  return analyzeSignature(request as Parameters<typeof analyzeSignature>[0]);
}
