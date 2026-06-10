import { randomUUID } from "node:crypto";
import type { SupportedChainName } from "@circle-fin/x402-batching/client";
import { createArcGatewayPayer } from "./arc-gateway.js";
import {
  parsePaymentRequiredHeader,
  sanitizePaymentError,
  validateGatewayRequirement
} from "./gateway-requirements.js";
import { hashBoundRequest } from "./request-binding.js";
import {
  AGENTWARDEN_CHALLENGE_HEADER,
  AGENTWARDEN_REQUEST_HASH_HEADER,
  PAYMENT_REQUIRED_HEADER,
  type GatewayPayer,
  type PaidRequestResult
} from "./x402-types.js";

export interface ArcGatewayPaidApiClientOptions {
  apiUrl: string;
  payTo: string;
  network: string;
  chain: SupportedChainName;
  privateKey?: `0x${string}`;
  maxPrice: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  payer?: GatewayPayer;
}

export class ArcGatewayPaidApiClient {
  private readonly fetcher: typeof fetch;
  private readonly payer: GatewayPayer;

  constructor(private readonly options: ArcGatewayPaidApiClientOptions) {
    this.fetcher = options.fetch ?? fetch;
    if (!options.payer && !options.privateKey) {
      throw new Error("X402_PAYER_PRIVATE_KEY is required for paid API mode");
    }
    this.payer =
      options.payer ??
      createArcGatewayPayer({
        chain: options.chain,
        privateKey: options.privateKey as `0x${string}`
      });
  }

  async post<T>(route: string, body: unknown): Promise<PaidRequestResult<T>> {
    const challenge = randomUUID();
    const requestHash = hashBoundRequest(route, body);
    const headers = {
      "content-type": "application/json",
      [AGENTWARDEN_CHALLENGE_HEADER]: challenge,
      [AGENTWARDEN_REQUEST_HASH_HEADER]: requestHash
    };
    const url = new URL(route, ensureTrailingSlash(this.options.apiUrl)).toString();

    const preflight = await withTimeout(
      this.fetcher(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }),
      this.options.timeoutMs
    );

    if (preflight.status !== 402) {
      throw new Error(`Expected x402 preflight status 402, received ${preflight.status}`);
    }

    const paymentRequired = preflight.headers.get(PAYMENT_REQUIRED_HEADER);
    if (!paymentRequired) {
      throw new Error("Missing PAYMENT-REQUIRED header");
    }

    const requirement = validateGatewayRequirement(
      parsePaymentRequiredHeader(paymentRequired),
      {
        network: this.options.network,
        payTo: this.options.payTo,
        maxPrice: this.options.maxPrice,
        chain: this.options.chain
      }
    );

    try {
      const paid = await withTimeout(
        this.payer.pay<T>(url, {
          method: "POST",
          headers,
          body
        }),
        this.options.timeoutMs
      );

      if (paid.status < 200 || paid.status >= 300) {
        throw new Error(`Paid API returned status ${paid.status}`);
      }

      return {
        data: paid.data,
        payment: {
          provider: "arc-gateway",
          payer: this.payer.address,
          amount: requirement.amount,
          network: requirement.network,
          transferId: paid.transaction
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        error.message = `Arc Gateway payment failed: ${sanitizePaymentError(error)}`;
        error.stack = undefined;
        throw error;
      }
      throw new Error(`Arc Gateway payment failed: ${sanitizePaymentError(error)}`, {
        cause: error
      });
    }
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`x402 request timed out after ${timeoutMs}ms`));
        });
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
