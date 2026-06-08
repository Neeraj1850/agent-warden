import type { SecurityReport, AnalysisRequest } from "../types/report.types.js";
import type { ChainStateSnapshot } from "../types/state.types.js";

export interface ChainStateProvider {
  getSnapshot(
    request: AnalysisRequest,
    report: SecurityReport
  ): Promise<ChainStateSnapshot>;
}
