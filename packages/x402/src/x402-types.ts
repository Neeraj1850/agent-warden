export interface X402PaymentRequirement {
  resource: string;
  network: string;
  payTo: string;
  maxAmount: string;
  asset: string;
  description: string;
}

export interface X402PaymentProof {
  paymentHeader: string;
  requestHash: string;
  resource: string;
}

export interface X402VerificationResult {
  ok: boolean;
  paymentId?: string;
  reason?: string;
}

export type X402Provider = "mock" | "arc-gateway" | "standard";

export const AGENTWARDEN_CHALLENGE_HEADER = "x-agentwarden-challenge";
export const AGENTWARDEN_REQUEST_HASH_HEADER = "x-agentwarden-request-hash";
export const PAYMENT_REQUIRED_HEADER = "payment-required";
export const PAYMENT_SIGNATURE_HEADER = "payment-signature";
export const PAYMENT_RESPONSE_HEADER = "payment-response";

export interface PaymentSettlementMetadata {
  provider: X402Provider;
  payer?: string;
  amount: string;
  network: string;
  transferId?: string;
}

export interface PaidRequestResult<T> {
  data: T;
  payment: PaymentSettlementMetadata;
}

export interface GatewayPaymentRequirement {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: {
    name?: string;
    version?: string;
    verifyingContract?: string;
  };
}

export interface PaymentRequiredPayload {
  x402Version: number;
  resource?: {
    url?: string;
    description?: string;
    mimeType?: string;
  };
  accepts: GatewayPaymentRequirement[];
}

export interface GatewayPayer {
  readonly address?: string;
  pay<T>(
    url: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      headers?: Record<string, string>;
    }
  ): Promise<{
    data: T;
    amount: bigint;
    formattedAmount: string;
    transaction: string;
    status: number;
  }>;
}
