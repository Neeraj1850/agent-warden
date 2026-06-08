import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTransactionWithSimulation,
  AnvilSimulator,
  encodeTopicAddress,
  EthCallSimulator,
  FetchJsonRpcClient,
  JsonRpcError,
  simulationEventTopics,
  StaticSimulator,
  type AnalysisRequest,
  type Address,
  type Hex,
  type JsonRpcClient,
  type SimulationResult,
  type TransactionSimulator
} from "../src/index.ts";

const CHAIN_ID = 5042002;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const SPENDER = "0x4444444444444444444444444444444444444444" as Address;

describe("simulation providers", () => {
  it("keeps static simulation offline", async () => {
    const result = await new StaticSimulator().simulate(transferRequest());

    assert.equal(result.status, "not_run");
    assert.equal(result.engine, "local-static");
  });

  it("reports eth_call success", async () => {
    const result = await new EthCallSimulator({
      client: new ScriptedRpcClient([{ method: "eth_call", result: "0x" }])
    }).simulate(transferRequest());

    assert.equal(result.status, "success");
    assert.equal(result.engine, "eth_call");
  });

  it("reports eth_call reverts as failed simulation", async () => {
    const result = await new EthCallSimulator({
      client: new ScriptedRpcClient([
        { method: "eth_call", error: new JsonRpcError("execution reverted") }
      ])
    }).simulate(transferRequest());

    assert.equal(result.status, "failed");
    assert.equal(result.failureCode, "reverted");
  });

  it("reports eth_call transport failure as unavailable", async () => {
    const result = await new EthCallSimulator({
      client: new ScriptedRpcClient([{ method: "eth_call", error: new Error("down") }])
    }).simulate(transferRequest());

    assert.equal(result.status, "unavailable");
    assert.equal(result.failureCode, "unavailable");
  });

  it("reports malformed eth_call responses as unavailable", async () => {
    const result = await new EthCallSimulator({
      client: new ScriptedRpcClient([{ method: "eth_call", result: undefined }])
    }).simulate(transferRequest());

    assert.equal(result.status, "unavailable");
    assert.equal(result.failureCode, "unavailable");
  });

  it("blocks Anvil chain mismatch before execution", async () => {
    const result = await new AnvilSimulator({
      client: new ScriptedRpcClient([{ method: "eth_chainId", result: "0x1" }])
    }).simulate(transferRequest());

    assert.equal(result.status, "failed");
    assert.equal(result.failureCode, "chain_mismatch");
    assert.equal(result.forkChainId, 1);
  });

  it("impersonates, funds, executes, and restores Anvil snapshots", async () => {
    const client = new ScriptedRpcClient([
      { method: "eth_chainId", result: `0x${CHAIN_ID.toString(16)}` },
      { method: "evm_snapshot", result: "0x1" },
      { method: "anvil_impersonateAccount", result: true },
      { method: "eth_estimateGas", result: "0x5208" },
      { method: "eth_gasPrice", result: "0x1" },
      { method: "eth_getBalance", result: "0x0" },
      { method: "anvil_setBalance", result: true },
      { method: "eth_sendTransaction", result: "0xabc" },
      {
        method: "eth_getTransactionReceipt",
        result: {
          status: "0x1",
          gasUsed: "0x5208",
          blockNumber: "0xa",
          logs: [erc20TransferLog(FROM, RECIPIENT, 1n)]
        }
      },
      { method: "anvil_stopImpersonatingAccount", result: true },
      { method: "evm_revert", result: true }
    ]);

    const result = await new AnvilSimulator({ client }).simulate(transferRequest());

    assert.equal(result.status, "success");
    assert.equal(result.engine, "anvil");
    assert.deepEqual(
      client.calls.map((call) => call.method),
      [
        "eth_chainId",
        "evm_snapshot",
        "anvil_impersonateAccount",
        "eth_estimateGas",
        "eth_gasPrice",
        "eth_getBalance",
        "anvil_setBalance",
        "eth_sendTransaction",
        "eth_getTransactionReceipt",
        "anvil_stopImpersonatingAccount",
        "evm_revert"
      ]
    );
    assert.equal(result.observedAssetDeltas?.length, 2);
  });

  it("reports Anvil snapshot restore failures", async () => {
    const client = new ScriptedRpcClient([
      { method: "eth_chainId", result: `0x${CHAIN_ID.toString(16)}` },
      { method: "evm_snapshot", result: "0x1" },
      { method: "anvil_impersonateAccount", result: true },
      { method: "eth_estimateGas", result: "0x5208" },
      { method: "eth_gasPrice", result: "0x1" },
      { method: "eth_getBalance", result: "0xffff" },
      { method: "eth_sendTransaction", result: "0xabc" },
      {
        method: "eth_getTransactionReceipt",
        result: { status: "0x1", logs: [] }
      },
      { method: "anvil_stopImpersonatingAccount", result: true },
      { method: "evm_revert", result: false }
    ]);

    const result = await new AnvilSimulator({ client }).simulate(transferRequest());

    assert.equal(result.status, "failed");
    assert.equal(result.failureCode, "state_restore_failed");
  });

  it("serializes concurrent Anvil simulations", async () => {
    const client = new ScriptedRpcClient(
      [
        { method: "eth_chainId", result: "0x1" },
        { method: "eth_chainId", result: "0x1" }
      ],
      { delayMs: 10 }
    );
    const simulator = new AnvilSimulator({ client });

    await Promise.all([
      simulator.simulate(transferRequest()),
      simulator.simulate(transferRequest())
    ]);

    assert.equal(client.maxActiveRequests, 1);
  });
});

const maybeAnvilIntegration = process.env.ANVIL_RPC_URL ? it : it.skip;

maybeAnvilIntegration(
  "executes against an external Anvil fork and restores state",
  async () => {
    const client = new FetchJsonRpcClient({
      rpcUrl: process.env.ANVIL_RPC_URL!,
      timeoutMs: 10_000
    });
    const chainId = Number(BigInt(await client.request<Hex>("eth_chainId")));
    const request = transferRequest();
    request.intent.chainId = chainId;
    request.transaction.chainId = chainId;
    request.transaction.to = RECIPIENT;
    request.transaction.data = "0x";
    request.transaction.value = "0";
    request.intent.action = "native_transfer";
    request.intent.tokenAddress = undefined;
    request.intent.allowNativeValue = true;

    const result = await new AnvilSimulator({ client }).simulate(request);

    assert.equal(result.engine, "anvil");
    assert.equal(result.forkChainId, chainId);
    assert.notEqual(result.failureCode, "state_restore_failed");
  }
);

describe("simulation policy", () => {
  it("blocks confirmed simulation reverts", async () => {
    const report = await analyzeTransactionWithSimulation(transferRequest(), {
      simulator: new FixedSimulator({
        status: "failed",
        engine: "anvil",
        failureCode: "reverted",
        summary: "reverted",
        revertReason: "ERC20: transfer amount exceeds balance",
        balanceDeltas: []
      })
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "SIMULATION_REVERTED"
      )
    );
  });

  it("blocks unexpected token outflows", async () => {
    const report = await analyzeTransactionWithSimulation(transferRequest(), {
      simulator: new FixedSimulator({
        status: "success",
        engine: "anvil",
        summary: "success",
        balanceDeltas: [],
        observedAssetDeltas: [
          {
            assetStandard: "erc20",
            tokenAddress: TOKEN,
            account: FROM,
            delta: "-2"
          },
          {
            assetStandard: "erc20",
            tokenAddress: TOKEN,
            account: RECIPIENT,
            delta: "2"
          }
        ]
      })
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "SIMULATION_UNEXPECTED_ASSET_OUTFLOW"
      )
    );
  });

  it("blocks hidden approval events", async () => {
    const report = await analyzeTransactionWithSimulation(transferRequest(), {
      simulator: new FixedSimulator({
        status: "success",
        engine: "anvil",
        summary: "success",
        balanceDeltas: [],
        observedApprovals: [
          {
            standard: "erc20",
            tokenAddress: TOKEN,
            owner: FROM,
            spender: SPENDER,
            amount: "10"
          }
        ]
      })
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "SIMULATION_UNEXPECTED_APPROVAL"
      )
    );
  });

  it("allows expected transfer simulation evidence", async () => {
    const report = await analyzeTransactionWithSimulation(transferRequest(), {
      simulator: new FixedSimulator({
        status: "success",
        engine: "anvil",
        summary: "success",
        balanceDeltas: [],
        observedAssetDeltas: [
          {
            assetStandard: "erc20",
            tokenAddress: TOKEN,
            account: FROM,
            delta: "-1"
          },
          {
            assetStandard: "erc20",
            tokenAddress: TOKEN,
            account: RECIPIENT,
            delta: "1"
          }
        ]
      })
    });

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.policyViolations.length, 0);
  });

  it("warns when simulation is unavailable", async () => {
    const report = await analyzeTransactionWithSimulation(transferRequest(), {
      simulator: new FixedSimulator({
        status: "unavailable",
        engine: "anvil",
        failureCode: "unavailable",
        summary: "not reachable",
        balanceDeltas: []
      })
    });

    assert.equal(report.verdict, "WARN");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "SIMULATION_UNAVAILABLE"
      )
    );
  });

  it("does not downgrade existing blocks", async () => {
    const request = approvalRequest();
    const report = await analyzeTransactionWithSimulation(request, {
      simulator: new FixedSimulator({
        status: "success",
        engine: "anvil",
        summary: "success",
        balanceDeltas: []
      })
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some((violation) => violation.code === "UNLIMITED_APPROVAL")
    );
  });
});

class FixedSimulator implements TransactionSimulator {
  constructor(private readonly result: SimulationResult) {}

  async simulate(_request: AnalysisRequest): Promise<SimulationResult> {
    return this.result;
  }
}

class ScriptedRpcClient implements JsonRpcClient {
  readonly calls: Array<{ method: string; params?: unknown[] }> = [];
  activeRequests = 0;
  maxActiveRequests = 0;

  constructor(
    private readonly script: Array<{
      method: string;
      result?: unknown;
      error?: Error;
    }>,
    private readonly options: { delayMs?: number } = {}
  ) {}

  async request<T>(method: string, params?: unknown[]): Promise<T> {
    this.activeRequests += 1;
    this.maxActiveRequests = Math.max(this.maxActiveRequests, this.activeRequests);
    this.calls.push({ method, params });

    try {
      if (this.options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
      }

      const next = this.script.shift();

      if (!next) {
        throw new Error(`Unexpected RPC call: ${method}`);
      }

      assert.equal(method, next.method);

      if (next.error) {
        throw next.error;
      }

      return next.result as T;
    } finally {
      this.activeRequests -= 1;
    }
  }
}

function transferRequest(): AnalysisRequest {
  return {
    intent: {
      action: "token_transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      recipient: RECIPIENT,
      amount: "1"
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Transfer(RECIPIENT, 1n)
    }
  };
}

function approvalRequest(): AnalysisRequest {
  return {
    intent: {
      action: "approval",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      spender: SPENDER
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Approve(SPENDER, (1n << 256n) - 1n)
    }
  };
}

function erc20TransferLog(
  from: Address,
  to: Address,
  amount: bigint
): {
  address: Address;
  topics: Hex[];
  data: Hex;
} {
  return {
    address: TOKEN,
    topics: [
      simulationEventTopics.transfer,
      encodeTopicAddress(from),
      encodeTopicAddress(to)
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}` as Hex
  };
}

function encodeErc20Transfer(recipient: Address, amount: bigint): Hex {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}`;
}

function encodeErc20Approve(spender: Address, amount: bigint): Hex {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
