import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARC_TESTNET_NETWORK,
  ArcGatewayPaidApiClient,
  CHAIN_CONFIGS,
  InMemoryPaymentChallengeStore,
  hashBoundRequest,
  parsePaymentRequiredHeader,
  parseUsdcPrice,
  validateGatewayRequirement,
  type GatewayPayer,
  type PaymentRequiredPayload
} from "../src/index.js";

const PAY_TO = "0x1111111111111111111111111111111111111111";

describe("x402 request binding", () => {
  it("hashes normalized object keys deterministically", () => {
    const left = hashBoundRequest("/analyze", {
      transaction: { value: "0", chainId: 5042002 },
      intent: { action: "token_transfer" }
    });
    const right = hashBoundRequest("/analyze", {
      intent: { action: "token_transfer" },
      transaction: { chainId: 5042002, value: "0" }
    });
    assert.equal(left, right);
  });

  it("rejects replay and concurrent challenge reuse", () => {
    const store = new InMemoryPaymentChallengeStore();
    assert.equal(store.issue("challenge", "hash", "/analyze").ok, true);

    const lock = store.lock("challenge", "hash", "/analyze");
    assert.equal(lock.ok, true);
    assert.equal(store.lock("challenge", "hash", "/analyze").ok, false);

    assert.ok(lock.ok && lock.lockId);
    assert.equal(store.consume("challenge", lock.lockId), true);
    assert.deepEqual(store.lock("challenge", "hash", "/analyze"), {
      ok: false,
      reason: "consumed"
    });
  });

  it("releases a failed settlement lock", () => {
    const store = new InMemoryPaymentChallengeStore();
    store.issue("challenge", "hash", "/analyze");
    const first = store.lock("challenge", "hash", "/analyze");
    assert.ok(first.ok && first.lockId);
    assert.equal(store.release("challenge", first.lockId), true);
    assert.equal(store.lock("challenge", "hash", "/analyze").ok, true);
  });

  it("expires challenges", () => {
    let now = 1_000;
    const store = new InMemoryPaymentChallengeStore(10, () => now);
    store.issue("challenge", "hash", "/analyze");
    now = 1_011;
    assert.deepEqual(store.lock("challenge", "hash", "/analyze"), {
      ok: false,
      reason: "expired"
    });
  });
});

describe("Arc Gateway payment requirements", () => {
  it("parses and validates an Arc Testnet requirement", () => {
    const payload = gatewayRequirement();
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const parsed = parsePaymentRequiredHeader(encoded);
    const requirement = validateGatewayRequirement(parsed, {
      network: ARC_TESTNET_NETWORK,
      payTo: PAY_TO,
      maxPrice: "$0.01",
      chain: "arcTestnet"
    });
    assert.equal(requirement.amount, "1000");
  });

  it("rejects excessive price and altered settlement fields", () => {
    assert.throws(
      () =>
        validateGatewayRequirement(gatewayRequirement({ amount: "10001" }), {
          network: ARC_TESTNET_NETWORK,
          payTo: PAY_TO,
          maxPrice: "$0.01",
          chain: "arcTestnet"
        }),
      /exceeds configured maximum/
    );

    for (const [field, value] of [
      ["network", "eip155:84532"],
      ["asset", "0x2222222222222222222222222222222222222222"],
      ["payTo", "0x3333333333333333333333333333333333333333"],
      ["scheme", "upto"]
    ] as const) {
      assert.throws(() => {
        const payload = gatewayRequirement();
        Object.assign(payload.accepts[0], { [field]: value });
        validateGatewayRequirement(payload, {
          network: ARC_TESTNET_NETWORK,
          payTo: PAY_TO,
          maxPrice: "$0.01",
          chain: "arcTestnet"
        });
      });
    }

    assert.throws(() => {
      const payload = gatewayRequirement();
      payload.accepts[0].extra = {
        ...payload.accepts[0].extra,
        verifyingContract: "0x4444444444444444444444444444444444444444"
      };
      validateGatewayRequirement(payload, {
        network: ARC_TESTNET_NETWORK,
        payTo: PAY_TO,
        maxPrice: "$0.01",
        chain: "arcTestnet"
      });
    }, /verifying contract/);
  });

  it("parses dollar prices without floating point arithmetic", () => {
    assert.equal(parseUsdcPrice("$0.001"), 1_000n);
    assert.equal(parseUsdcPrice("1.25"), 1_250_000n);
  });

  it("rejects malformed facilitator requirements", () => {
    assert.throws(
      () => parsePaymentRequiredHeader("not-base64-json"),
      /Malformed PAYMENT-REQUIRED/
    );
  });
});

describe("Arc Gateway paid API client", () => {
  it("preflights, validates, pays, and returns bounded metadata", async () => {
    const calls: Array<{ kind: string; body?: unknown }> = [];
    const payer: GatewayPayer = {
      address: "0x5555555555555555555555555555555555555555",
      async pay<T>(_url, options) {
        calls.push({ kind: "pay", body: options.body });
        return {
          data: { verdict: "ALLOW" } as T,
          amount: 1_000n,
          formattedAmount: "0.001",
          transaction: "gateway-transfer-id",
          status: 200
        };
      }
    };
    const client = new ArcGatewayPaidApiClient({
      apiUrl: "http://localhost:8787",
      payTo: PAY_TO,
      network: ARC_TESTNET_NETWORK,
      chain: "arcTestnet",
      maxPrice: "$0.01",
      timeoutMs: 1_000,
      payer,
      fetch: async (_url, init) => {
        calls.push({ kind: "preflight", body: init?.body });
        return new Response("{}", {
          status: 402,
          headers: {
            "payment-required": Buffer.from(
              JSON.stringify(gatewayRequirement())
            ).toString("base64")
          }
        });
      }
    });

    const body = { intent: { action: "token_transfer" } };
    const result = await client.post<{ verdict: string }>("/analyze", body);
    assert.equal(result.data.verdict, "ALLOW");
    assert.deepEqual(result.payment, {
      provider: "arc-gateway",
      payer: payer.address,
      amount: "1000",
      network: ARC_TESTNET_NETWORK,
      transferId: "gateway-transfer-id"
    });
    assert.equal(calls[0].kind, "preflight");
    assert.equal(calls[1].kind, "pay");
    assert.deepEqual(calls[1].body, body);
  });

  it("rejects an excessive price before invoking the payer", async () => {
    let paid = false;
    const payer: GatewayPayer = {
      async pay<T>() {
        paid = true;
        return {
          data: {} as T,
          amount: 0n,
          formattedAmount: "0",
          transaction: "",
          status: 200
        };
      }
    };
    const client = new ArcGatewayPaidApiClient({
      apiUrl: "http://localhost:8787",
      payTo: PAY_TO,
      network: ARC_TESTNET_NETWORK,
      chain: "arcTestnet",
      maxPrice: "$0.001",
      timeoutMs: 1_000,
      payer,
      fetch: async () =>
        new Response("{}", {
          status: 402,
          headers: {
            "payment-required": Buffer.from(
              JSON.stringify(gatewayRequirement({ amount: "2000" }))
            ).toString("base64")
          }
        })
    });

    await assert.rejects(() => client.post("/analyze", {}), /exceeds configured/);
    assert.equal(paid, false);
  });

  it("times out unavailable preflight requests", async () => {
    const payer: GatewayPayer = {
      async pay<T>() {
        return {
          data: {} as T,
          amount: 0n,
          formattedAmount: "0",
          transaction: "",
          status: 200
        };
      }
    };
    const client = new ArcGatewayPaidApiClient({
      apiUrl: "http://localhost:8787",
      payTo: PAY_TO,
      network: ARC_TESTNET_NETWORK,
      chain: "arcTestnet",
      maxPrice: "$0.01",
      timeoutMs: 5,
      payer,
      fetch: async () => new Promise<Response>(() => undefined)
    });

    await assert.rejects(() => client.post("/analyze", {}), /timed out/);
  });

  it("redacts private-key-shaped values from payer failures", async () => {
    const secret = "a".repeat(64);
    const payer: GatewayPayer = {
      async pay() {
        throw new Error(`failure privateKey=${secret}`);
      }
    };
    const client = new ArcGatewayPaidApiClient({
      apiUrl: "http://localhost:8787",
      payTo: PAY_TO,
      network: ARC_TESTNET_NETWORK,
      chain: "arcTestnet",
      maxPrice: "$0.01",
      timeoutMs: 1_000,
      payer,
      fetch: async () =>
        new Response("{}", {
          status: 402,
          headers: {
            "payment-required": Buffer.from(
              JSON.stringify(gatewayRequirement())
            ).toString("base64")
          }
        })
    });

    await assert.rejects(
      () => client.post("/analyze", {}),
      (error: Error) =>
        error.message.includes("[redacted-secret]") && !error.message.includes(secret)
    );
  });
});

function gatewayRequirement(
  overrides: Record<string, string> = {}
): PaymentRequiredPayload {
  const arc = CHAIN_CONFIGS.arcTestnet;
  return {
    x402Version: 2,
    resource: {
      url: "/analyze",
      description: "AgentWarden analysis",
      mimeType: "application/json"
    },
    accepts: [
      {
        scheme: "exact",
        network: ARC_TESTNET_NETWORK,
        asset: arc.usdc,
        amount: "1000",
        payTo: PAY_TO,
        extra: {
          name: "GatewayWalletBatched",
          version: "1",
          verifyingContract: arc.gatewayWallet
        },
        ...overrides
      }
    ]
  };
}
