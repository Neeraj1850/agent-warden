import {
  analyzeTransactionWithSimulation,
  type AnalysisRequest,
  type SecurityReport
} from "@arc-warden/core";

export async function analyzeRequest(
  request: AnalysisRequest
): Promise<SecurityReport> {
  return analyzeTransactionWithSimulation(request);
}
