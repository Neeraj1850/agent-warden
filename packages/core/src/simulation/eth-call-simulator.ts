import type { AnalysisRequest, SimulationResult } from "../types/report.types.js";
import { inferStaticBalanceDeltas } from "../analyzer/balance-delta-analyzer.js";
import { decodeCalldata } from "../analyzer/calldata-decoder.js";
import {
  FetchJsonRpcClient,
  JsonRpcError,
  optionalRpcQuantity,
  type JsonRpcClient
} from "./json-rpc-client.js";
import type { TransactionSimulator } from "./simulator.interface.js";

export interface EthCallSimulatorOptions {
  rpcUrl?: string;
  timeoutMs?: number;
  client?: JsonRpcClient;
}

export class EthCallSimulator implements TransactionSimulator {
  private readonly client?: JsonRpcClient;

  constructor(options: EthCallSimulatorOptions = {}) {
    this.client =
      options.client ??
      (options.rpcUrl
        ? new FetchJsonRpcClient({
            rpcUrl: options.rpcUrl,
            timeoutMs: options.timeoutMs
          })
        : undefined);
  }

  async simulate(request: AnalysisRequest): Promise<SimulationResult> {
    const decoded = decodeCalldata(request.transaction, request.intent);
    const balanceDeltas = inferStaticBalanceDeltas(request.transaction, decoded);

    if (!this.client) {
      return {
        status: "unavailable",
        engine: "eth_call",
        failureCode: "unavailable",
        summary: "eth_call simulation unavailable because no RPC URL is configured.",
        balanceDeltas
      };
    }

    try {
      const result = await this.client.request<string>("eth_call", [
        {
          from: request.transaction.from,
          to: request.transaction.to,
          value: optionalRpcQuantity(request.transaction.value),
          data: request.transaction.data
        },
        "latest"
      ]);

      if (typeof result !== "string") {
        return {
          status: "unavailable",
          engine: "eth_call",
          failureCode: "unavailable",
          summary: "eth_call simulation returned a malformed RPC response.",
          balanceDeltas
        };
      }

      return {
        status: "success",
        engine: "eth_call",
        summary: "eth_call simulation completed successfully.",
        balanceDeltas
      };
    } catch (error) {
      const isRpcRevert = error instanceof JsonRpcError;

      return {
        status: isRpcRevert ? "failed" : "unavailable",
        engine: "eth_call",
        failureCode: isRpcRevert ? "reverted" : "unavailable",
        summary: isRpcRevert
          ? "eth_call simulation reverted or failed."
          : "eth_call simulation request failed.",
        revertReason: error instanceof Error ? error.message : "Unknown RPC error",
        balanceDeltas
      };
    }
  }
}
