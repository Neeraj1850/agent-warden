import type { AnalysisRequest, SimulationResult } from "../types/report.types.js";
import type { TransactionSimulator } from "./simulator.interface.js";

export class AnvilSimulator implements TransactionSimulator {
  async simulate(_request: AnalysisRequest): Promise<SimulationResult> {
    return {
      status: "not_run",
      engine: "anvil",
      summary:
        "Anvil fork simulator placeholder. Local fork execution is a future integration.",
      balanceDeltas: []
    };
  }
}
