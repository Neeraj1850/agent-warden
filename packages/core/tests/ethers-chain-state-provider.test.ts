import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTransaction,
  EthersChainStateProvider,
  type Address,
  type AnalysisRequest,
  type EthersContractFactory,
  type EthersLikeProvider
} from "../src/index.ts";

const CHAIN_ID = 5042002;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const SPENDER = "0x4444444444444444444444444444444444444444" as Address;

describe("EthersChainStateProvider", () => {
  it("builds a normalized ERC-20 state snapshot from provider and contract reads", async () => {
    const request = erc20ApprovalRequest(100n);
    const report = analyzeTransaction(request);
    const provider = new FakeProvider();
    const chainStateProvider = new EthersChainStateProvider({
      provider,
      contractFactory: fakeContractFactory({
        balance: 1_000n,
        allowance: 5n,
        symbol: "TEST",
        decimals: 6n
      })
    });

    const snapshot = await chainStateProvider.getSnapshot(request, report);

    assert.equal(snapshot.account.nativeBalance, "1000000000000000000");
    assert.equal(snapshot.account.nonce, 7);
    assert.equal(snapshot.target?.bytecode, "0x1234");
    assert.equal(snapshot.target?.isContract, true);
    assert.equal(snapshot.erc20[0]?.balance, "1000");
    assert.equal(snapshot.erc20[0]?.allowance, "5");
    assert.equal(snapshot.erc20[0]?.symbol, "TEST");
    assert.equal(snapshot.erc20[0]?.decimals, 6);
    assert.equal(snapshot.lookupErrors.length, 0);
  });

  it("records lookup errors instead of throwing", async () => {
    const request = erc20ApprovalRequest(100n);
    const report = analyzeTransaction(request);
    const chainStateProvider = new EthersChainStateProvider({
      provider: new FailingProvider(),
      contractFactory: fakeContractFactory({
        balance: 1_000n,
        allowance: 5n
      })
    });

    const snapshot = await chainStateProvider.getSnapshot(request, report);

    assert.ok(snapshot.lookupErrors.some((error) => error.operation === "bytecode"));
    assert.ok(snapshot.lookupErrors.some((error) => error.operation === "nativeBalance"));
  });
});

class FakeProvider implements EthersLikeProvider {
  async getBalance(_address: Address): Promise<bigint> {
    return 1_000_000_000_000_000_000n;
  }

  async getCode(_address: Address): Promise<string> {
    return "0x1234";
  }

  async getTransactionCount(_address: Address): Promise<number> {
    return 7;
  }
}

class FailingProvider implements EthersLikeProvider {
  async getBalance(_address: Address): Promise<bigint> {
    throw new Error("balance unavailable");
  }

  async getCode(_address: Address): Promise<string> {
    throw new Error("code unavailable");
  }

  async getTransactionCount(_address: Address): Promise<number> {
    throw new Error("nonce unavailable");
  }
}

function fakeContractFactory(values: {
  balance: bigint;
  allowance: bigint;
  symbol?: string;
  decimals?: number | bigint;
}): EthersContractFactory {
  return () => ({
    async balanceOf() {
      return values.balance;
    },
    async allowance() {
      return values.allowance;
    },
    async symbol() {
      return values.symbol;
    },
    async decimals() {
      return values.decimals;
    }
  });
}

function erc20ApprovalRequest(amount: bigint): AnalysisRequest {
  return {
    intent: {
      action: "approval",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      spender: SPENDER,
      maxAmount: amount.toString()
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Approve(SPENDER, amount)
    }
  };
}

function encodeErc20Approve(spender: Address, amount: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
