import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARC_TESTNET_NETWORK, ArcGatewayPaidApiClient } from "../src/index.js";

const liveEnabled = process.env.X402_LIVE_TEST === "true";

describe("Arc Gateway live paid analysis", { skip: !liveEnabled }, () => {
  it("pays for one low-cost Arc Testnet analysis", async () => {
    const client = new ArcGatewayPaidApiClient({
      apiUrl: requiredEnv("AGENTWARDEN_API_URL"),
      payTo: requiredEnv("X402_PAY_TO"),
      network: ARC_TESTNET_NETWORK,
      chain: "arcTestnet",
      privateKey: requiredEnv("X402_PAYER_PRIVATE_KEY") as `0x${string}`,
      maxPrice: process.env.X402_MAX_PRICE ?? "$0.01",
      timeoutMs: Number(process.env.X402_PAYMENT_TIMEOUT_MS ?? 15_000)
    });
    const from = requiredEnv("X402_LIVE_FROM") as `0x${string}`;
    const token = requiredEnv("X402_LIVE_TOKEN") as `0x${string}`;
    const recipient = requiredEnv("X402_LIVE_RECIPIENT") as `0x${string}`;
    const result = await client.post<{ reportHash: string; verdict: string }>(
      "/analyze",
      {
        requestId: `arc-live-${Date.now()}`,
        intent: {
          action: "token_transfer",
          chainId: 5042002,
          from,
          tokenAddress: token,
          recipient,
          amount: "1"
        },
        transaction: {
          chainId: 5042002,
          from,
          to: token,
          value: "0",
          data: `0xa9059cbb${recipient.slice(2).padStart(64, "0")}${"1".padStart(64, "0")}`
        }
      }
    );

    assert.match(result.data.reportHash, /^0x[a-fA-F0-9]{64}$/);
    assert.ok(result.payment.transferId);
    assert.equal(result.payment.network, ARC_TESTNET_NETWORK);
  });
});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for X402_LIVE_TEST=true`);
  }
  return value;
}
