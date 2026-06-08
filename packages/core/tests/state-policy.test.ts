import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTransaction,
  applyAdditionalPolicyViolations,
  evaluateStatePolicies,
  MAX_UINT256,
  type Address,
  type AnalysisRequest,
  type ChainStateSnapshot,
  type SecurityReport
} from "../src/index.ts";

const CHAIN_ID = 5042002;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const SPENDER = "0x4444444444444444444444444444444444444444" as Address;
const OTHER = "0x5555555555555555555555555555555555555555" as Address;

describe("evaluateStatePolicies", () => {
  it("keeps behavior unchanged when no state provider is configured", () => {
    const report = analyzeTransaction(erc20TransferRequest(1n));

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.stateSnapshot, undefined);
    assert.equal(report.stateFindings, undefined);
  });

  it("blocks ERC-20 transfers with insufficient balance", () => {
    const { request, report } = analyze(erc20TransferRequest(100n));
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        erc20: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            balance: "99"
          }
        ]
      })
    );

    assert.equal(violations[0]?.code, "INSUFFICIENT_TOKEN_BALANCE");
    assert.equal(violations[0]?.severity, "critical");
  });

  it("warns when a bounded ERC-20 allowance already exists", () => {
    const { request, report } = analyze(erc20ApprovalRequest(10n));
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        erc20: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            spender: SPENDER,
            balance: "1000",
            allowance: "5"
          }
        ]
      })
    );

    assert.equal(violations[0]?.code, "EXISTING_ALLOWANCE_PRESENT");
    assert.equal(violations[0]?.severity, "medium");
  });

  it("blocks approval when dangerous allowance already exists", () => {
    const { request, report } = analyze(erc20ApprovalRequest(10n));
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        erc20: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            spender: SPENDER,
            balance: "1000",
            allowance: MAX_UINT256
          }
        ]
      })
    );

    assert.equal(violations[0]?.code, "ALLOWANCE_ALREADY_DANGEROUS");
    assert.equal(violations[0]?.severity, "critical");
  });

  it("blocks ERC-721 transfer when ownerOf does not match signer", () => {
    const { request, report } = analyze(erc721TransferRequest());
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        erc721: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            tokenId: "7",
            ownerOf: OTHER
          }
        ]
      })
    );

    assert.equal(violations[0]?.code, "NFT_OWNER_MISMATCH");
    assert.equal(violations[0]?.severity, "critical");
  });

  it("blocks existing ERC-721 token approval", () => {
    const { request, report } = analyze(erc721ApprovalRequest());
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        erc721: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            tokenId: "7",
            approved: SPENDER
          }
        ]
      })
    );

    assert.equal(violations[0]?.code, "NFT_TOKEN_ALREADY_APPROVED");
  });

  it("blocks existing ERC-721 operator approval", () => {
    const { request, report } = analyze(erc721OperatorApprovalRequest());
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        erc721: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            operator: SPENDER,
            isApprovedForAll: true
          }
        ]
      })
    );

    assert.ok(
      violations.some((violation) => violation.code === "NFT_OPERATOR_ALREADY_APPROVED")
    );
  });

  it("blocks existing ERC-1155 operator approval", () => {
    const { request, report } = analyze(erc1155OperatorApprovalRequest());
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        erc1155: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            operator: SPENDER,
            isApprovedForAll: true
          }
        ]
      })
    );

    assert.ok(
      violations.some((violation) => violation.code === "NFT_OPERATOR_ALREADY_APPROVED")
    );
  });

  it("blocks contract calls when target has no bytecode", () => {
    const request: AnalysisRequest = {
      intent: {
        action: "contract_call",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: "0xdeadbeef"
      }
    };
    const report = analyzeTransaction(request);
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        target: {
          address: TOKEN,
          bytecode: "0x",
          isContract: false
        }
      })
    );

    assert.ok(violations.some((violation) => violation.code === "TARGET_HAS_NO_CODE"));
  });

  it("warns when state lookup fails", () => {
    const { request, report } = analyze(erc20TransferRequest(1n));
    const violations = evaluateStatePolicies(
      request,
      report,
      snapshot(request, {
        lookupErrors: [
          {
            subject: TOKEN,
            operation: "erc20.balanceOf",
            message: "connection refused"
          }
        ]
      })
    );

    assert.equal(violations[0]?.code, "STATE_LOOKUP_FAILED");
    assert.equal(violations[0]?.severity, "medium");
  });

  it("includes state snapshot in deterministic report hash", () => {
    const { request, report } = analyze(erc20TransferRequest(1n));
    const state = snapshot(request, {
      erc20: [
        {
          tokenAddress: TOKEN,
          owner: FROM,
          balance: "100"
        }
      ]
    });
    const next = applyAdditionalPolicyViolations(request, report, [], {
      stateSnapshot: state,
      stateViolations: []
    });

    assert.notEqual(next.reportHash, report.reportHash);
    assert.deepEqual(next.stateSnapshot, state);
  });
});

function analyze(request: AnalysisRequest): {
  request: AnalysisRequest;
  report: SecurityReport;
} {
  return {
    request,
    report: analyzeTransaction(request)
  };
}

function snapshot(
  request: AnalysisRequest,
  overrides: Partial<ChainStateSnapshot>
): ChainStateSnapshot {
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
    ...overrides
  };
}

function erc20TransferRequest(amount: bigint): AnalysisRequest {
  return {
    intent: {
      action: "token_transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      recipient: RECIPIENT,
      amount: amount.toString()
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Transfer(RECIPIENT, amount)
    }
  };
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

function erc721TransferRequest(): AnalysisRequest {
  return {
    intent: {
      action: "nft_transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      recipient: RECIPIENT,
      tokenId: "7"
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc721TransferFrom(FROM, RECIPIENT, 7n)
    }
  };
}

function erc721ApprovalRequest(): AnalysisRequest {
  return {
    intent: {
      action: "nft_transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      spender: SPENDER,
      tokenId: "7"
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc721Approve(SPENDER, 7n)
    }
  };
}

function erc721OperatorApprovalRequest(): AnalysisRequest {
  return {
    intent: {
      action: "nft_transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      spender: SPENDER
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeSetApprovalForAll(SPENDER, true)
    }
  };
}

function erc1155OperatorApprovalRequest(): AnalysisRequest {
  return {
    intent: {
      action: "approval",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      spender: SPENDER
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeSetApprovalForAll(SPENDER, true)
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

function encodeErc721TransferFrom(
  from: Address,
  to: Address,
  tokenId: bigint
): `0x${string}` {
  return `0x23b872dd${encodeAddress(from)}${encodeAddress(to)}${encodeUint256(tokenId)}`;
}

function encodeSetApprovalForAll(operator: Address, approved: boolean): `0x${string}` {
  return `0xa22cb465${encodeAddress(operator)}${encodeUint256(approved ? 1n : 0n)}`;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint | string): string {
  return BigInt(value).toString(16).padStart(64, "0");
}
