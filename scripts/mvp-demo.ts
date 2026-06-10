import {
  analyzeTransaction,
  analyzeTransactionWithSimulation,
  verifyReportHash,
  type Address,
  type AnalysisRequest,
  type Hex,
  type PolicyProfile,
  type SecurityReport,
  type SimulationResult,
  type TransactionSimulator,
  type Verdict
} from "../packages/core/src/index.ts";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHAIN_ID = 11155111;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const OTHER_RECIPIENT = "0x4444444444444444444444444444444444444444" as Address;
const SPENDER = "0x5555555555555555555555555555555555555555" as Address;
const ROUTER = "0x6666666666666666666666666666666666666666" as Address;
const UNKNOWN_ROUTER = "0x7777777777777777777777777777777777777777" as Address;

const scenarios: Array<{
  label: string;
  expectedVerdict: Verdict;
  run: () => Promise<SecurityReport> | SecurityReport;
}> = [
  {
    label: "payment-allowlisted-transfer",
    expectedVerdict: "ALLOW",
    run: () =>
      analyzeTransaction({
        ...transferRequest(RECIPIENT),
        policyProfile: paymentProfile()
      })
  },
  {
    label: "payment-blocks-unlisted-recipient",
    expectedVerdict: "BLOCK",
    run: () =>
      analyzeTransaction({
        ...transferRequest(OTHER_RECIPIENT),
        policyProfile: paymentProfile()
      })
  },
  {
    label: "treasury-blocks-approval",
    expectedVerdict: "BLOCK",
    run: () =>
      analyzeTransaction({
        ...approvalRequest(),
        profileId: "strict-treasury"
      })
  },
  {
    label: "trading-allows-known-router",
    expectedVerdict: "ALLOW",
    run: () =>
      analyzeTransactionWithSimulation(
        {
          ...swapRequest(ROUTER),
          policyProfile: tradingProfile()
        },
        { simulator: fixedSimulator(successSimulation()) }
      )
  },
  {
    label: "trading-blocks-unknown-router",
    expectedVerdict: "BLOCK",
    run: () =>
      analyzeTransactionWithSimulation(
        {
          ...swapRequest(UNKNOWN_ROUTER),
          policyProfile: tradingProfile()
        },
        { simulator: fixedSimulator(successSimulation()) }
      )
  }
];

console.log("[mvp-demo] AgentWarden deterministic MVP flow");

let failures = 0;
const reportStoreDir = await mkdtemp(join(tmpdir(), "agent-warden-mvp-"));
const reports = new Map<string, SecurityReport>();

for (const scenario of scenarios) {
  const report = await scenario.run();
  reports.set(scenario.label, report);
  await writeFile(
    join(reportStoreDir, `${report.reportHash}.json`),
    JSON.stringify(report, bigintJsonReplacer, 2),
    "utf8"
  );
  const passed = report.verdict === scenario.expectedVerdict;
  const status = passed ? "PASS" : "FAIL";
  const topViolations = report.policyViolations
    .slice(0, 3)
    .map((violation) => violation.code)
    .join(",");

  console.log(
    `[${status}] ${scenario.label} expected=${scenario.expectedVerdict} actual=${report.verdict} risk=${report.riskScore} action=${report.actionType}`
  );
  console.log(`       violations=${topViolations || "none"}`);
  console.log(`       recommendedAction=${report.recommendedAction}`);
  console.log(`       hash=${report.reportHash}`);

  if (!passed) {
    failures += 1;
  }
}

const allowReport = reports.get("payment-allowlisted-transfer");
const blockReport = reports.get("payment-blocks-unlisted-recipient");
const allowVerification = allowReport
  ? verifyReportHash({
      kind: "transaction",
      request: {
        ...transferRequest(RECIPIENT),
        policyProfile: paymentProfile()
      },
      report: allowReport
    })
  : undefined;
const blockVerification = blockReport
  ? verifyReportHash({
      kind: "transaction",
      request: {
        ...transferRequest(OTHER_RECIPIENT),
        policyProfile: paymentProfile()
      },
      report: blockReport
    })
  : undefined;

console.log(`[mvp-demo] reportStore=${reportStoreDir}`);
console.log(
  `[mvp-demo] verify allow=${allowVerification?.valid ?? false} block=${blockVerification?.valid ?? false}`
);

if (!allowVerification?.valid || !blockVerification?.valid) {
  failures += 1;
}

console.log(`[mvp-demo] complete total=${scenarios.length} failures=${failures}`);

if (failures > 0) {
  process.exitCode = 1;
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function fixedSimulator(result: SimulationResult): TransactionSimulator {
  return {
    async simulate(_request: AnalysisRequest): Promise<SimulationResult> {
      return result;
    }
  };
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
    profileId: "payment-demo",
    name: "Payment Demo",
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
    profileId: "trading-demo",
    name: "Trading Demo",
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
    summary: "mock successful fork simulation",
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
