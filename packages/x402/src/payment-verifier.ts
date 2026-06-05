import type { X402PaymentProof, X402VerificationResult } from "./x402-types.js";

export interface X402PaymentVerifier {
  verify(proof: X402PaymentProof): Promise<X402VerificationResult>;
}

export class NoopX402PaymentVerifier implements X402PaymentVerifier {
  async verify(proof: X402PaymentProof): Promise<X402VerificationResult> {
    if (!proof.paymentHeader || !proof.requestHash || !proof.resource) {
      return {
        ok: false,
        reason: "Missing x402 payment proof fields"
      };
    }

    return {
      ok: true,
      paymentId: "noop-payment"
    };
  }
}
