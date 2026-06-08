import type { AnalysisRequest, SimulationResult } from "../types/report.types.js";
import type { Hex } from "../types/transaction.types.js";
import { inferStaticBalanceDeltas } from "../analyzer/balance-delta-analyzer.js";
import { decodeCalldata } from "../analyzer/calldata-decoder.js";
import { decodeSimulationLogs } from "./log-decoder.js";
import {
  FetchJsonRpcClient,
  optionalRpcQuantity,
  parseRpcQuantity,
  toRpcQuantity,
  type JsonRpcClient
} from "./json-rpc-client.js";
import type { TransactionSimulator } from "./simulator.interface.js";

export interface AnvilSimulatorOptions {
  rpcUrl?: string;
  timeoutMs?: number;
  client?: JsonRpcClient;
  fallbackSimulator?: TransactionSimulator;
}

interface TransactionReceipt {
  status?: Hex;
  gasUsed?: Hex;
  blockNumber?: Hex;
  logs?: Array<{
    address: Hex;
    topics: Hex[];
    data: Hex;
  }>;
}

export class AnvilSimulator implements TransactionSimulator {
  private readonly client?: JsonRpcClient;
  private readonly mutex = new AsyncMutex();

  constructor(private readonly options: AnvilSimulatorOptions = {}) {
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
    return this.mutex.runExclusive(() => this.simulateExclusive(request));
  }

  private async simulateExclusive(request: AnalysisRequest): Promise<SimulationResult> {
    const decoded = decodeCalldata(request.transaction, request.intent);
    const fallbackDeltas = inferStaticBalanceDeltas(request.transaction, decoded);
    let result: SimulationResult | undefined;

    if (!this.client) {
      return this.fallback(request, {
        status: "unavailable",
        engine: "anvil",
        failureCode: "unavailable",
        summary: "Anvil simulation unavailable because no ANVIL_RPC_URL is configured.",
        balanceDeltas: fallbackDeltas
      });
    }

    if (
      request.transaction.authorizationList?.length ||
      request.transaction.blobVersionedHashes?.length ||
      request.transaction.maxFeePerBlobGas
    ) {
      return this.fallback(request, {
        status: "unavailable",
        engine: "anvil",
        failureCode: "unsupported",
        summary:
          "Anvil simulation does not execute blob or EIP-7702 authorization-list envelopes in V1.",
        balanceDeltas: fallbackDeltas
      });
    }

    let snapshotId: string | undefined;
    let impersonated = false;

    try {
      const forkChainId = Number(
        parseRpcQuantity(await this.client.request<Hex>("eth_chainId"))
      );

      if (forkChainId !== request.transaction.chainId) {
        result = {
          status: "failed",
          engine: "anvil",
          failureCode: "chain_mismatch",
          summary: "Anvil fork chain ID does not match the transaction chain ID.",
          revertReason: `forkChainId=${forkChainId} transactionChainId=${request.transaction.chainId}`,
          balanceDeltas: fallbackDeltas,
          forkChainId
        };
      } else {
        snapshotId = await this.client.request<string>("evm_snapshot");
        await this.client.request<boolean>("anvil_impersonateAccount", [
          request.transaction.from
        ]);
        impersonated = true;

        const gas = await this.client.request<Hex>("eth_estimateGas", [
          this.buildTransactionRequest(request)
        ]);
        await this.fundSenderForGas(request, gas);

        const transactionHash = await this.client.request<Hex>("eth_sendTransaction", [
          {
            ...this.buildTransactionRequest(request),
            gas
          }
        ]);
        const receipt = await this.waitForReceipt(transactionHash);

        if (receipt.status === "0x0") {
          result = {
            status: "failed",
            engine: "anvil",
            failureCode: "reverted",
            summary: "Anvil fork execution reverted.",
            revertReason: "Receipt status is 0x0.",
            balanceDeltas: fallbackDeltas,
            gasUsed: receipt.gasUsed
              ? parseRpcQuantity(receipt.gasUsed).toString()
              : undefined,
            blockNumber: receipt.blockNumber
              ? Number(parseRpcQuantity(receipt.blockNumber))
              : undefined,
            forkChainId
          };
        } else {
          const logs = (receipt.logs ?? []).map((log) => ({
            address: log.address,
            topics: log.topics,
            data: log.data
          }));
          const decodedLogs = decodeSimulationLogs(logs);

          result = {
            status: "success",
            engine: "anvil",
            summary: "Anvil fork execution completed successfully.",
            balanceDeltas: decodedLogs.observedAssetDeltas.length
              ? decodedLogs.observedAssetDeltas
              : fallbackDeltas,
            gasUsed: receipt.gasUsed
              ? parseRpcQuantity(receipt.gasUsed).toString()
              : undefined,
            blockNumber: receipt.blockNumber
              ? Number(parseRpcQuantity(receipt.blockNumber))
              : undefined,
            logs,
            observedAssetDeltas: decodedLogs.observedAssetDeltas,
            observedApprovals: decodedLogs.observedApprovals,
            forkChainId
          };
        }
      }
    } catch (error) {
      result = {
        status: "unavailable",
        engine: "anvil",
        failureCode: "unavailable",
        summary: "Anvil simulation request failed.",
        revertReason: error instanceof Error ? error.message : "Unknown Anvil error",
        balanceDeltas: fallbackDeltas
      };
    } finally {
      if (impersonated) {
        await this.client
          ?.request<boolean>("anvil_stopImpersonatingAccount", [request.transaction.from])
          .catch(() => undefined);
      }

      if (snapshotId) {
        const restored = await this.client
          ?.request<boolean>("evm_revert", [snapshotId])
          .catch(() => false);

        if (restored === false) {
          result = {
            status: "failed",
            engine: "anvil",
            failureCode: "state_restore_failed",
            summary: "Anvil simulation completed but failed to restore fork state.",
            revertReason: "evm_revert returned false or failed.",
            balanceDeltas: fallbackDeltas
          };
        }
      }
    }

    result ??= {
      status: "unavailable",
      engine: "anvil",
      failureCode: "unavailable",
      summary: "Anvil simulation did not produce a result.",
      balanceDeltas: fallbackDeltas
    };

    if (result.engine === "anvil" && result.failureCode === "unavailable") {
      return this.fallback(request, result);
    }

    return result;
  }

  private async fallback(
    request: AnalysisRequest,
    anvilResult: SimulationResult
  ): Promise<SimulationResult> {
    if (!this.options.fallbackSimulator) {
      return anvilResult;
    }

    const fallbackResult = await this.options.fallbackSimulator.simulate(request);

    return {
      ...fallbackResult,
      fallbackFrom: "anvil",
      fallbackReason: anvilResult.revertReason ?? anvilResult.summary
    };
  }

  private buildTransactionRequest(request: AnalysisRequest) {
    return {
      from: request.transaction.from,
      to: request.transaction.to,
      value: optionalRpcQuantity(request.transaction.value),
      data: request.transaction.data
    };
  }

  private async fundSenderForGas(request: AnalysisRequest, gas: Hex): Promise<void> {
    const gasPrice = parseRpcQuantity(await this.client!.request<Hex>("eth_gasPrice"));
    const gasLimit = parseRpcQuantity(gas);
    const value = BigInt(request.transaction.value ?? "0");
    const requiredBalance = value + gasPrice * gasLimit;
    const currentBalance = parseRpcQuantity(
      await this.client!.request<Hex>("eth_getBalance", [
        request.transaction.from,
        "latest"
      ])
    );

    if (currentBalance < requiredBalance) {
      await this.client!.request<boolean>("anvil_setBalance", [
        request.transaction.from,
        toRpcQuantity(requiredBalance)
      ]);
    }
  }

  private async waitForReceipt(transactionHash: Hex): Promise<TransactionReceipt> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const receipt = await this.client!.request<TransactionReceipt | null>(
        "eth_getTransactionReceipt",
        [transactionHash]
      );

      if (receipt) {
        return receipt;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error("Timed out waiting for Anvil transaction receipt.");
  }
}

class AsyncMutex {
  private current: Promise<unknown> = Promise.resolve();

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.current;
    let release!: () => void;
    this.current = new Promise((resolve) => {
      release = () => resolve(undefined);
    });

    await previous;

    try {
      return await task();
    } finally {
      release();
    }
  }
}
