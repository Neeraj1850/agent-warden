import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeSignature,
  analyzeTransaction,
  verifyReportHash,
  type Address,
  type AnalysisRequest,
  type SignatureAnalysisRequest
} from "../src/index.ts";

const CHAIN_ID = 11155111;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;

describe("report verification", () => {
  it("verifies unchanged transaction reports", () => {
    const request = transactionRequest();
    const report = analyzeTransaction(request);
    const verification = verifyReportHash({
      kind: "transaction",
      request,
      report
    });

    assert.equal(verification.valid, true);
    assert.equal(verification.expectedHash, report.reportHash);
    assert.equal(verification.actualHash, report.reportHash);
  });

  it("fails verification when report content is tampered", () => {
    const request = transactionRequest();
    const report = analyzeTransaction(request);
    const verification = verifyReportHash({
      kind: "transaction",
      request,
      report: {
        ...report,
        riskScore: 0
      }
    });

    assert.equal(verification.valid, false);
    assert.notEqual(verification.expectedHash, verification.actualHash);
  });

  it("verifies unchanged signature reports", () => {
    const request = signatureRequest();
    const report = analyzeSignature(request);
    const verification = verifyReportHash({
      kind: "signature",
      request,
      report
    });

    assert.equal(verification.valid, true);
    assert.equal(verification.expectedHash, report.reportHash);
  });
});

function transactionRequest(): AnalysisRequest {
  return {
    requestId: "verify-transaction",
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

function signatureRequest(): SignatureAnalysisRequest {
  return {
    requestId: "verify-signature",
    intent: {
      action: "login",
      chainId: CHAIN_ID,
      from: FROM
    },
    payload: {
      kind: "personal_sign",
      message: "Sign in to AgentWarden with nonce 123."
    }
  };
}

function encodeErc20Transfer(recipient: Address, amount: bigint): `0x${string}` {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}`;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
