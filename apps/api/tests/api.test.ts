import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import {
  LocalReputationProvider,
  EthersChainStateProvider,
  type AnalysisRequest,
  type ChainStateProvider,
  type ChainStateSnapshot,
  type SecurityReport
} from "@agent-warden/core";
import { createApiServer } from "../src/server.js";
import { createDefaultChainStateProvider } from "../src/services/analysis.service.js";
import type { ApiEnv } from "../src/config/env.js";

const FROM = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const SPENDER = "0x4444444444444444444444444444444444444444";
const MAX_UINT256 = (1n << 256n) - 1n;

describe("AgentWarden API", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = await createApiServer(testEnv());
    server = app.listen(0);
    await onceListening(server);
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await closeServer(server);
  });

  it("returns health status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as { status: string; service: string };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "agent-warden-api");
  });

  it("allows safe transaction analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      requestId: "safe-transfer",
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "ALLOW");
    assert.equal(body.actionType, "erc20_transfer");
  });

  it("blocks malicious approval transaction analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      requestId: "bad-approval",
      intent: {
        action: "approval",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Approve(SPENDER, MAX_UINT256)
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.equal(body.actionType, "erc20_approval");
  });

  it("blocks an approval followed by a transfer in the same signer session", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      requestId: "approval-follow-up",
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.ok(
      body.policyViolations.some(
        (violation: { code: string }) => violation.code === "RECENT_APPROVAL_SEQUENCE"
      )
    );
  });

  it("blocks a target in the local risky-address registry", async () => {
    const riskyRecipient = "0x5555555555555555555555555555555555555555";
    const app = await createApiServer(testEnv(), {
      reputationProvider: new LocalReputationProvider({
        riskyAddresses: {
          [riskyRecipient]: "Known local test threat."
        }
      })
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, {
        requestId: "risky-native-transfer",
        intent: {
          action: "native_transfer",
          chainId: 5042002,
          from: FROM,
          recipient: riskyRecipient,
          amount: "1",
          allowNativeValue: true
        },
        transaction: {
          chainId: 5042002,
          from: FROM,
          to: riskyRecipient,
          value: "1",
          data: "0x"
        }
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, "BLOCK");
      assert.ok(
        body.policyViolations.some(
          (violation: { code: string }) => violation.code === "LOCAL_RISKY_ADDRESS"
        )
      );
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("includes a state snapshot when a chain-state provider is injected", async () => {
    const app = await createApiServer(testEnv(), {
      chainStateProvider: new StaticChainStateProvider({
        erc20: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            balance: "10"
          }
        ]
      })
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, {
        requestId: "state-safe-transfer",
        intent: {
          action: "token_transfer",
          chainId: 5042002,
          from: FROM,
          tokenAddress: TOKEN,
          recipient: RECIPIENT,
          amount: "1"
        },
        transaction: {
          chainId: 5042002,
          from: FROM,
          to: TOKEN,
          value: "0",
          data: encodeErc20Transfer(RECIPIENT, 1n)
        }
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, "ALLOW");
      assert.equal(body.stateSnapshot.erc20[0].balance, "10");
      assert.deepEqual(body.stateFindings, []);
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("blocks unsafe transfer with insufficient injected state", async () => {
    const app = await createApiServer(testEnv(), {
      chainStateProvider: new StaticChainStateProvider({
        erc20: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            balance: "0"
          }
        ]
      })
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, {
        requestId: "state-unsafe-transfer",
        intent: {
          action: "token_transfer",
          chainId: 5042002,
          from: FROM,
          tokenAddress: TOKEN,
          recipient: RECIPIENT,
          amount: "1"
        },
        transaction: {
          chainId: 5042002,
          from: FROM,
          to: TOKEN,
          value: "0",
          data: encodeErc20Transfer(RECIPIENT, 1n)
        }
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, "BLOCK");
      assert.ok(
        body.policyViolations.some(
          (violation: { code: string }) => violation.code === "INSUFFICIENT_TOKEN_BALANCE"
        )
      );
      assert.ok(
        body.stateFindings.some(
          (finding: { code: string }) => finding.code === "INSUFFICIENT_TOKEN_BALANCE"
        )
      );
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("uses ethers as the default chain-state provider when RPC is configured", () => {
    const provider = createDefaultChainStateProvider({
      analysisRpcUrl: "http://127.0.0.1:8545",
      analysisRpcTimeoutMs: 3_000
    });

    assert.ok(provider instanceof EthersChainStateProvider);
  });

  it("blocks permit signature analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze-signature`, {
      requestId: "permit",
      intent: {
        action: "permit",
        chainId: 5042002,
        from: FROM,
        verifyingContract: TOKEN,
        spender: SPENDER,
        maxAmount: MAX_UINT256.toString()
      },
      payload: {
        kind: "eip712_typed_data",
        typedData: {
          domain: {
            name: "TestToken",
            chainId: 5042002,
            verifyingContract: TOKEN
          },
          primaryType: "Permit",
          message: {
            owner: FROM,
            spender: SPENDER,
            value: MAX_UINT256.toString(),
            deadline: "9999999999"
          }
        }
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.equal(body.actionType, "permit_signature");
  });

  it("allows login signature analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze-signature`, {
      requestId: "login",
      intent: {
        action: "login",
        chainId: 5042002,
        from: FROM
      },
      payload: {
        kind: "personal_sign",
        message: "Sign in to AgentWarden with nonce 123."
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "ALLOW");
    assert.equal(body.actionType, "login_signature");
  });

  it("returns 400 for malformed analysis requests", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      intent: {
        action: "token_transfer"
      }
    });
    const body = (await response.json()) as { error: string; message: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Bad request");
    assert.match(body.message, /Expected transaction to be an object/);
  });
});

function testEnv(): ApiEnv {
  return {
    port: 0,
    x402Enabled: false,
    x402Mode: "mock",
    x402PayTo: "",
    x402Network: "eip155:84532",
    x402Price: "$0.001",
    x402FacilitatorUrl: "https://x402.org/facilitator",
    analysisRpcTimeoutMs: 3_000
  };
}

class StaticChainStateProvider implements ChainStateProvider {
  constructor(private readonly overrides: Partial<ChainStateSnapshot>) {}

  async getSnapshot(
    request: AnalysisRequest,
    _report: SecurityReport
  ): Promise<ChainStateSnapshot> {
    return {
      chainId: request.transaction.chainId,
      blockTag: "latest",
      account: {
        address: request.transaction.from,
        nativeBalance: "1000000000000000000",
        nonce: 1
      },
      target: request.transaction.to
        ? {
            address: request.transaction.to,
            bytecode: "0x1234",
            isContract: true
          }
        : undefined,
      erc20: [],
      erc721: [],
      erc1155: [],
      lookupErrors: [],
      ...this.overrides
    };
  }
}

function onceListening(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.once("listening", resolve);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function encodeErc20Transfer(recipient: string, amount: bigint): `0x${string}` {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}`;
}

function encodeErc20Approve(spender: string, amount: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeAddress(address: string): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
