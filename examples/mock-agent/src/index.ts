const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111;
const MAX_UINT256 = (1n << 256n) - 1n;

type Scenario = "safe-transfer" | "malicious-approval";
type Address = `0x${string}`;

interface AnalysisRequest {
  requestId: string;
  intent: {
    action: "transfer" | "approve";
    chainId: number;
    from: Address;
    tokenAddress: Address;
    recipient?: Address;
    spender?: Address;
    amount?: string;
    maxAmount?: string;
    description: string;
  };
  transaction: {
    chainId: number;
    from: Address;
    to: Address;
    data: `0x${string}`;
    value: string;
  };
}

interface SecurityReport {
  verdict: "ALLOW" | "WARN" | "BLOCK";
  riskScore: number;
  reportHash: string;
  policyViolations: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
  saferAlternative?: string;
}

const scenario = parseScenario(process.argv[2]);
const dryRun = process.argv.includes("--dry-run");
const config = getConfig();
const request = buildAnalysisRequest(scenario, config);

printRequest(request, scenario, config.apiUrl);

if (dryRun) {
  console.log("[mock-agent] dry run complete; request was not sent");
} else {
  const report = await sendAnalysisRequest(config.apiUrl, request);
  printReport(report);
}

function parseScenario(value: string | undefined): Scenario {
  if (value === "malicious-approval") {
    return "malicious-approval";
  }

  return "safe-transfer";
}

function getConfig() {
  return {
    apiUrl: process.env.AGENTWARDEN_API_URL ?? "http://localhost:8787/analyze",
    wallet: addressEnv("MOCK_AGENT_WALLET", "0x1111111111111111111111111111111111111111"),
    tokenAddress: addressEnv(
      "SEPOLIA_TOKEN_ADDRESS",
      "0x2222222222222222222222222222222222222222"
    ),
    recipient: addressEnv(
      "SEPOLIA_RECIPIENT",
      "0x3333333333333333333333333333333333333333"
    ),
    spender: addressEnv("SEPOLIA_SPENDER", "0x5555555555555555555555555555555555555555")
  };
}

function addressEnv(name: string, fallback: Address): Address {
  const value = process.env[name] ?? fallback;

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be an EVM address`);
  }

  return value as Address;
}

function buildAnalysisRequest(
  selectedScenario: Scenario,
  config: ReturnType<typeof getConfig>
): AnalysisRequest {
  if (selectedScenario === "malicious-approval") {
    return {
      requestId: `mock-agent-${selectedScenario}-${Date.now()}`,
      intent: {
        action: "approve",
        chainId: ETHEREUM_SEPOLIA_CHAIN_ID,
        from: config.wallet,
        tokenAddress: config.tokenAddress,
        spender: config.spender,
        maxAmount: MAX_UINT256.toString(),
        description: "Mock agent is about to approve a spender on Ethereum Sepolia."
      },
      transaction: {
        chainId: ETHEREUM_SEPOLIA_CHAIN_ID,
        from: config.wallet,
        to: config.tokenAddress,
        value: "0",
        data: encodeErc20Approve(config.spender, MAX_UINT256)
      }
    };
  }

  const amount = 1_000_000n;

  return {
    requestId: `mock-agent-${selectedScenario}-${Date.now()}`,
    intent: {
      action: "transfer",
      chainId: ETHEREUM_SEPOLIA_CHAIN_ID,
      from: config.wallet,
      tokenAddress: config.tokenAddress,
      recipient: config.recipient,
      amount: amount.toString(),
      description: "Mock agent is about to transfer a test token on Ethereum Sepolia."
    },
    transaction: {
      chainId: ETHEREUM_SEPOLIA_CHAIN_ID,
      from: config.wallet,
      to: config.tokenAddress,
      value: "0",
      data: encodeErc20Transfer(config.recipient, amount)
    }
  };
}

async function sendAnalysisRequest(
  apiUrl: string,
  request: AnalysisRequest
): Promise<SecurityReport> {
  const route = new URL(apiUrl).pathname;
  const challenge = randomUUID();
  const bindingHeaders = {
    "content-type": "application/json",
    "x-request-id": request.requestId,
    [AGENTWARDEN_CHALLENGE_HEADER]: challenge,
    [AGENTWARDEN_REQUEST_HASH_HEADER]: hashBoundRequest(route, request)
  };
  console.log("[mock-agent] sending unpaid x402 preflight");
  const preflight = await fetch(apiUrl, {
    method: "POST",
    headers: bindingHeaders,
    body: JSON.stringify(request)
  });

  if (preflight.ok) {
    console.log(`[mock-agent] response status=${preflight.status}`);
    return (await preflight.json()) as SecurityReport;
  }

  if (preflight.status !== 402) {
    throw new Error(`AgentWarden preflight failed: ${await preflight.text()}`);
  }

  console.log("[mock-agent] retrying with mock x402 payment");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      ...bindingHeaders,
      "x-agentwarden-mock-payment": "paid"
    },
    body: JSON.stringify(request)
  });
  const responseText = await response.text();
  console.log(`[mock-agent] response status=${response.status}`);

  if (!response.ok) {
    throw new Error(`AgentWarden rejected request: ${responseText}`);
  }

  return JSON.parse(responseText) as SecurityReport;
}

function printRequest(
  request: AnalysisRequest,
  selectedScenario: Scenario,
  apiUrl: string
): void {
  console.log("[mock-agent] scenario", selectedScenario);
  console.log("[mock-agent] api", apiUrl);
  console.log("[mock-agent] wallet", request.intent.from);
  console.log("[mock-agent] txChainId", request.transaction.chainId);
  console.log("[mock-agent] requestId", request.requestId);
  console.log("[mock-agent] unsignedTx", JSON.stringify(request.transaction, null, 2));
}

function printReport(report: SecurityReport): void {
  console.log("[mock-agent] verdict", report.verdict);
  console.log("[mock-agent] riskScore", report.riskScore);
  console.log("[mock-agent] reportHash", report.reportHash);

  if (report.policyViolations.length > 0) {
    console.log("[mock-agent] policyViolations");
    for (const violation of report.policyViolations) {
      console.log(
        `  - ${violation.severity.toUpperCase()} ${violation.code}: ${violation.message}`
      );
    }
  }

  if (report.saferAlternative) {
    console.log("[mock-agent] saferAlternative", report.saferAlternative);
  }
}

function encodeErc20Transfer(recipient: Address, amount: bigint): `0x${string}` {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}`;
}

function encodeErc20Approve(spender: Address, amount: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
import { randomUUID } from "node:crypto";
import {
  AGENTWARDEN_CHALLENGE_HEADER,
  AGENTWARDEN_REQUEST_HASH_HEADER,
  hashBoundRequest
} from "@agent-warden/x402";
