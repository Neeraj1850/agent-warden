import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTransaction,
  analyzeTransactionWithSimulation,
  MAX_UINT256,
  type AnalysisRequest,
  type Address
} from "../src/index.ts";

const CHAIN_ID = 5042002;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const USDC = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const OTHER = "0x4444444444444444444444444444444444444444" as Address;
const SPENDER = "0x5555555555555555555555555555555555555555" as Address;

describe("analyzeTransaction", () => {
  it("allows a safe USDC transfer matching intent", () => {
    const report = analyzeTransaction(transferRequest({ recipient: RECIPIENT }));

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.riskScore, 5);
    assert.equal(report.decodedTransaction.functionName, "erc20.transfer");
    assert.equal(report.actionType, "erc20_transfer");
    assert.equal(report.decodedActions[0]?.assetStandard, "erc20");
    assert.equal(report.policyViolations.length, 0);
    assert.match(report.summary, /^ALLOW: erc20 transfer/);
    assert.equal(report.findings.length, 0);
    assert.match(report.recommendedAction, /Proceed only if/);
    assert.match(report.reportHash, /^0x[a-f0-9]{64}$/);
  });

  it("blocks recipient mismatch", () => {
    const report = analyzeTransaction(
      transferRequest({ intentRecipient: RECIPIENT, recipient: OTHER })
    );

    assert.equal(report.verdict, "BLOCK");
    assert.equal(report.policyViolations[0]?.code, "RECIPIENT_MISMATCH");
  });

  it("blocks unlimited approval", () => {
    const report = analyzeTransaction(approvalRequest(MAX_UINT256.toString()));

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some((violation) => violation.code === "UNLIMITED_APPROVAL")
    );
    assert.ok(report.findings.some((finding) => finding.code === "UNLIMITED_APPROVAL"));
    assert.match(report.explanation, /Primary finding/);
    assert.match(report.recommendedAction, /bounded approval/);
  });

  it("blocks unknown function selector", () => {
    const report = analyzeTransaction({
      intent: {
        action: "contract_call",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: USDC
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: USDC,
        data: "0xdeadbeef"
      }
    });

    assert.equal(report.verdict, "BLOCK");
    assert.equal(report.decodedTransaction.functionName, "unknown");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "UNKNOWN_FUNCTION_SELECTOR"
      )
    );
  });

  it("blocks chain mismatch", () => {
    const request = transferRequest({ recipient: RECIPIENT });
    request.transaction.chainId = 84532;

    const report = analyzeTransaction(request);

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some((violation) => violation.code === "CHAIN_MISMATCH")
    );
  });

  it("allows native transfer only when intent allows native value", () => {
    const report = analyzeTransaction({
      intent: {
        action: "native_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        recipient: RECIPIENT,
        amount: "1000000000000000",
        allowNativeValue: true
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: RECIPIENT,
        value: "1000000000000000",
        data: "0x"
      }
    });

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.actionType, "native_transfer");
    assert.equal(report.assetDeltas.length, 2);
  });

  it("blocks unexpected native value on contract calls", () => {
    const report = analyzeTransaction({
      intent: {
        action: "contract_call",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: USDC
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: USDC,
        value: "1",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "UNEXPECTED_NATIVE_VALUE"
      )
    );
  });

  it("detects contract deployment", () => {
    const report = analyzeTransaction({
      intent: {
        action: "deployment",
        chainId: CHAIN_ID,
        from: FROM
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        data: "0x60006000"
      }
    });

    assert.equal(report.actionType, "deployment");
    assert.equal(report.decodedTransaction.functionName, "contract.deployment");
  });

  it("warns on ERC721 token-specific approval", () => {
    const report = analyzeTransaction({
      intent: {
        action: "nft_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: USDC,
        spender: SPENDER,
        tokenId: "7"
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: USDC,
        data: encodeErc721Approve(SPENDER, 7n)
      }
    });

    assert.equal(report.verdict, "WARN");
    assert.equal(report.actionType, "erc721_approval");
    assert.ok(report.approvalFindings.some((finding) => finding.standard === "erc721"));
  });

  it("blocks ERC721 setApprovalForAll", () => {
    const report = analyzeTransaction({
      intent: {
        action: "nft_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: USDC,
        spender: SPENDER
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: USDC,
        data: encodeSetApprovalForAll(SPENDER, true)
      }
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "OPERATOR_APPROVAL_FOR_ALL"
      )
    );
  });

  it("decodes ERC1155 transfer", () => {
    const report = analyzeTransaction({
      intent: {
        action: "nft_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: USDC,
        recipient: RECIPIENT,
        tokenId: "42",
        amount: "3"
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: USDC,
        data: encodeErc1155SafeTransferFrom(FROM, RECIPIENT, 42n, 3n)
      }
    });

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.actionType, "erc1155_transfer");
    assert.equal(report.assetDeltas[0]?.tokenId, "42");
  });

  it("blocks multicall with hidden approval", () => {
    const report = analyzeTransaction({
      intent: {
        action: "multicall",
        chainId: CHAIN_ID,
        from: FROM
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: USDC,
        data: `0xac9650d8${"0".repeat(64)}095ea7b3${"0".repeat(120)}` as `0x${string}`
      }
    });

    assert.equal(report.verdict, "BLOCK");
    assert.equal(report.actionType, "multicall");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "SUSPICIOUS_MULTICALL"
      )
    );
  });

  it("blocks EIP-7702 authorization-list transactions by default", () => {
    const report = analyzeTransaction({
      intent: {
        action: "token_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: USDC,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: USDC,
        type: 4,
        authorizationList: [{ address: OTHER }],
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });

    assert.equal(report.transactionEnvelope.type, "eip7702");
    assert.equal(report.verdict, "BLOCK");
    assert.ok(
      report.policyViolations.some(
        (violation) => violation.code === "EIP7702_AUTHORIZATION_PRESENT"
      )
    );
  });

  it("keeps report hash deterministic", () => {
    const request = transferRequest({ recipient: RECIPIENT });

    assert.equal(
      analyzeTransaction(request).reportHash,
      analyzeTransaction(request).reportHash
    );
  });

  it("reports disabled RPC simulation as not_run", () => {
    const report = analyzeTransaction(transferRequest({ recipient: RECIPIENT }));

    assert.equal(report.simulationResult.status, "not_run");
    assert.equal(report.simulationResult.engine, "local-static");
  });

  it("reports eth_call failure when RPC simulation fails", async () => {
    const report = await analyzeTransactionWithSimulation(
      transferRequest({ recipient: RECIPIENT }),
      { rpcUrl: "http://127.0.0.1:1" }
    );

    assert.equal(report.simulationResult.status, "failed");
    assert.equal(report.simulationResult.engine, "eth_call");
    assert.ok(report.simulationResult.revertReason);
  });
});

function transferRequest(options: {
  intentRecipient?: Address;
  recipient: Address;
  amount?: bigint;
}): AnalysisRequest {
  const amount = options.amount ?? 1_000_000n;

  return {
    intent: {
      action: "transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: USDC,
      recipient: options.intentRecipient ?? options.recipient,
      amount: amount.toString()
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: USDC,
      data: encodeErc20Transfer(options.recipient, amount)
    }
  };
}

function approvalRequest(amount: string): AnalysisRequest {
  return {
    intent: {
      action: "approve",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: USDC,
      spender: SPENDER,
      maxAmount: amount
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: USDC,
      data: encodeErc20Approve(SPENDER, BigInt(amount))
    }
  };
}

function encodeErc20Transfer(recipient: Address, amount: bigint): `0x${string}` {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}`;
}

function encodeErc20Approve(spender: Address, amount: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeErc721Approve(spender: Address, tokenId: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(tokenId)}`;
}

function encodeSetApprovalForAll(operator: Address, approved: boolean): `0x${string}` {
  return `0xa22cb465${encodeAddress(operator)}${encodeUint256(approved ? 1n : 0n)}`;
}

function encodeErc1155SafeTransferFrom(
  from: Address,
  to: Address,
  tokenId: bigint,
  amount: bigint
): `0x${string}` {
  return `0xf242432a${encodeAddress(from)}${encodeAddress(to)}${encodeUint256(tokenId)}${encodeUint256(amount)}${encodeUint256(160n)}`;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
