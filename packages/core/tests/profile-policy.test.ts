import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTransaction,
  analyzeTransactionWithSimulation,
  type Address,
  type AnalysisRequest,
  type Hex,
  type PolicyProfile,
  type SimulationResult,
  type TransactionSimulator
} from "../src/index.ts";

const CHAIN_ID = 11155111;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const OTHER_RECIPIENT = "0x4444444444444444444444444444444444444444" as Address;
const SPENDER = "0x5555555555555555555555555555555555555555" as Address;
const ROUTER = "0x6666666666666666666666666666666666666666" as Address;
const UNKNOWN_ROUTER = "0x7777777777777777777777777777777777777777" as Address;

describe("policy profiles", () => {
  it("strict treasury blocks approvals", () => {
    const report = analyzeTransaction({
      ...approvalRequest(),
      profileId: "strict-treasury"
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(hasViolation(report, "PROFILE_APPROVAL_BLOCKED"));
  });

  it("strict treasury blocks deployments", () => {
    const report = analyzeTransaction({
      profileId: "strict-treasury",
      intent: {
        action: "deployment",
        chainId: CHAIN_ID,
        from: FROM,
        expectedOutcome: { allowUnknownLogs: false }
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        data: "0x60006000" as Hex,
        value: "0"
      }
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(hasViolation(report, "PROFILE_DEPLOYMENT_BLOCKED"));
  });

  it("payment profile allows allowlisted ERC-20 transfers", () => {
    const report = analyzeTransaction({
      ...transferRequest(RECIPIENT),
      policyProfile: paymentProfile()
    });

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.policyViolations.length, 0);
  });

  it("payment profile blocks non-allowlisted recipients", () => {
    const report = analyzeTransaction({
      ...transferRequest(OTHER_RECIPIENT),
      policyProfile: paymentProfile()
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(hasViolation(report, "PROFILE_RECIPIENT_NOT_ALLOWED"));
  });

  it("trading profile allows known router swaps with successful simulation", async () => {
    const report = await analyzeTransactionWithSimulation(
      {
        ...swapRequest(ROUTER),
        policyProfile: tradingProfile()
      },
      { simulator: new FixedSimulator(successSimulation()) }
    );

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.policyViolations.length, 0);
  });

  it("trading profile blocks unknown routers", async () => {
    const report = await analyzeTransactionWithSimulation(
      {
        ...swapRequest(UNKNOWN_ROUTER),
        policyProfile: tradingProfile()
      },
      { simulator: new FixedSimulator(successSimulation()) }
    );

    assert.equal(report.verdict, "BLOCK");
    assert.ok(hasViolation(report, "PROFILE_ROUTER_NOT_ALLOWED"));
  });

  it("blocks when a profile requires simulation and it is unavailable", async () => {
    const report = await analyzeTransactionWithSimulation(
      {
        ...swapRequest(ROUTER),
        policyProfile: tradingProfile()
      },
      {
        simulator: new FixedSimulator({
          status: "unavailable",
          engine: "anvil",
          failureCode: "unavailable",
          summary: "fork unavailable",
          balanceDeltas: []
        })
      }
    );

    assert.equal(report.verdict, "BLOCK");
    assert.ok(hasViolation(report, "PROFILE_SIMULATION_REQUIRED"));
  });

  it("blocks when a profile requires expected outcome and it is missing", () => {
    const request = transferRequest(RECIPIENT);
    delete request.intent.expectedOutcome;

    const report = analyzeTransaction({
      ...request,
      policyProfile: paymentProfile()
    });

    assert.equal(report.verdict, "BLOCK");
    assert.ok(hasViolation(report, "PROFILE_EXPECTED_OUTCOME_REQUIRED"));
  });

  it("default profile preserves current behavior", () => {
    const report = analyzeTransaction(transferRequest(RECIPIENT));

    assert.equal(report.verdict, "ALLOW");
    assert.equal(report.policyViolations.length, 0);
  });
});

class FixedSimulator implements TransactionSimulator {
  constructor(private readonly result: SimulationResult) {}

  async simulate(_request: AnalysisRequest): Promise<SimulationResult> {
    return this.result;
  }
}

function transferRequest(recipient: Address): AnalysisRequest {
  return {
    intent: {
      action: "token_transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      recipient,
      amount: "100",
      expectedOutcome: {
        recipients: [recipient],
        tokenOutflows: [
          {
            assetStandard: "erc20",
            tokenAddress: TOKEN,
            recipient,
            amount: "100"
          }
        ],
        allowUnknownLogs: false
      }
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Transfer(recipient, 100n)
    }
  };
}

function approvalRequest(): AnalysisRequest {
  return {
    intent: {
      action: "approval",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      spender: SPENDER,
      expectedOutcome: {
        approvals: [
          {
            standard: "erc20",
            tokenAddress: TOKEN,
            spender: SPENDER,
            maxAmount: "100"
          }
        ]
      }
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Approve(SPENDER, 100n)
    }
  };
}

function swapRequest(router: Address): AnalysisRequest {
  return {
    intent: {
      action: "swap",
      chainId: CHAIN_ID,
      from: FROM,
      expectedOutcome: {
        tokenOutflows: [
          {
            assetStandard: "erc20",
            tokenAddress: TOKEN,
            maxAmount: "100"
          }
        ],
        allowUnknownLogs: true
      }
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: router,
      value: "0",
      data: "0x38ed1739" as Hex
    }
  };
}

function paymentProfile(): PolicyProfile {
  return {
    profileId: "payment-test",
    name: "Payment Test",
    mode: "strict",
    allowedChains: [CHAIN_ID],
    allowedActions: ["token_transfer"],
    allowedRecipients: [RECIPIENT],
    allowedTokens: [TOKEN],
    maxTokenAmounts: [{ tokenAddress: TOKEN, maxAmount: "1000" }],
    blockApprovals: true,
    blockOperatorApprovals: true,
    blockContractDeployments: true,
    blockUnknownContracts: true,
    requireExpectedOutcome: true
  };
}

function tradingProfile(): PolicyProfile {
  return {
    profileId: "trading-test",
    name: "Trading Test",
    mode: "balanced",
    allowedChains: [CHAIN_ID],
    allowedActions: ["swap"],
    allowedRouters: [ROUTER],
    maxTokenAmounts: [{ tokenAddress: TOKEN, maxAmount: "1000" }],
    blockContractDeployments: true,
    blockUnknownContracts: true,
    requireSimulation: true,
    requireExpectedOutcome: true
  };
}

function successSimulation(): SimulationResult {
  return {
    status: "success",
    engine: "anvil",
    summary: "success",
    balanceDeltas: [],
    observedAssetDeltas: [
      {
        assetStandard: "erc20",
        tokenAddress: TOKEN,
        account: FROM,
        delta: "-100"
      }
    ]
  };
}

function hasViolation(
  report: { policyViolations: Array<{ code: string }> },
  code: string
): boolean {
  return report.policyViolations.some((violation) => violation.code === code);
}

function encodeErc20Transfer(recipient: Address, amount: bigint): Hex {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}` as Hex;
}

function encodeErc20Approve(spender: Address, amount: bigint): Hex {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}` as Hex;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
