import { inferStaticBalanceDeltas } from "../analyzer/balance-delta-analyzer.js";
import { decodeCalldata } from "../analyzer/calldata-decoder.js";
import type { AnalysisRequest, SimulationResult } from "../types/report.types.js";
import type { TransactionSimulator } from "./simulator.interface.js";

export class StaticSimulator implements TransactionSimulator {
  async simulate(request: AnalysisRequest): Promise<SimulationResult> {
    const decoded = decodeCalldata(request.transaction, request.intent);

    return {
      status: "not_run",
      engine: "local-static",
      summary:
        "Static analysis only. Configure SIMULATION_MODE=eth_call or SIMULATION_MODE=anvil to run execution simulation.",
      balanceDeltas: inferStaticBalanceDeltas(request.transaction, decoded)
    };
  }
}
