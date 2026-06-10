import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import type { GatewayPaymentRequirement, PaymentRequiredPayload } from "./x402-types.js";

export interface GatewayRequirementPolicy {
  network: string;
  payTo: string;
  maxPrice: string;
  chain: keyof typeof CHAIN_CONFIGS;
}

export function parsePaymentRequiredHeader(header: string): PaymentRequiredPayload {
  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as Partial<PaymentRequiredPayload>;
    if (
      payload.x402Version !== 2 ||
      !Array.isArray(payload.accepts) ||
      payload.accepts.length === 0
    ) {
      throw new Error("Unsupported or empty payment requirement");
    }

    return payload as PaymentRequiredPayload;
  } catch (error) {
    throw new Error("Malformed PAYMENT-REQUIRED header", {
      cause: error
    });
  }
}

export function validateGatewayRequirement(
  payload: PaymentRequiredPayload,
  policy: GatewayRequirementPolicy
): GatewayPaymentRequirement {
  const chainConfig = CHAIN_CONFIGS[policy.chain];
  if (!chainConfig) {
    throw new Error(`Unsupported Gateway payer chain: ${String(policy.chain)}`);
  }

  const requirement = payload.accepts.find(
    (candidate) =>
      candidate.network === policy.network &&
      candidate.scheme === "exact" &&
      candidate.extra?.name === "GatewayWalletBatched"
  );

  if (!requirement) {
    throw new Error("No acceptable Arc Gateway payment requirement");
  }

  requireEqual(requirement.network, policy.network, "network");
  requireAddressEqual(requirement.payTo, policy.payTo, "payee");
  requireAddressEqual(requirement.asset, chainConfig.usdc, "USDC asset");
  requireAddressEqual(
    requirement.extra?.verifyingContract ?? "",
    chainConfig.gatewayWallet,
    "Gateway verifying contract"
  );

  if (requirement.scheme !== "exact") {
    throw new Error("Unsupported x402 payment scheme");
  }

  const maxAmount = parseUsdcPrice(policy.maxPrice);
  const amount = parseAtomicAmount(requirement.amount);
  if (amount > maxAmount) {
    throw new Error(
      `Payment price ${amount.toString()} exceeds configured maximum ${maxAmount.toString()}`
    );
  }

  return requirement;
}

export function parseUsdcPrice(price: string): bigint {
  const normalized = price.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Expected a non-negative USDC price with at most 6 decimals");
  }

  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function sanitizePaymentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/0x[a-fA-F0-9]{128,}/g, "[redacted-payment-payload]")
    .replace(/\b[a-fA-F0-9]{64}\b/g, "[redacted-secret]");
}

function parseAtomicAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount)) {
    throw new Error("Payment amount must be an atomic-unit integer");
  }
  return BigInt(amount);
}

function requireEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`Unexpected payment ${label}`);
  }
}

function requireAddressEqual(actual: string, expected: string, label: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Unexpected payment ${label}`);
  }
}
