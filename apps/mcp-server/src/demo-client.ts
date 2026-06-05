import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  AnalysisRequest,
  Address,
  SecurityReport,
  Verdict
} from "@agent-warden/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeTransactionToolName } from "./tools/analyze-transaction.tool.js";

const CHAIN_ID = 11155111;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const SPENDER = "0x5555555555555555555555555555555555555555" as Address;
const MAX_UINT256 = (1n << 256n) - 1n;

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const serverEntrypoint = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const serverSource = join(repoRoot, "apps", "mcp-server", "src", "index.ts");

const client = new Client({
  name: "agent-warden-demo-client",
  version: "0.1.0"
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntrypoint, serverSource],
  cwd: repoRoot,
  stderr: "pipe"
});

transport.stderr?.on("data", (chunk) => {
  const line = chunk.toString().trim();
  if (line) {
    console.error(`[mcp-server] ${line}`);
  }
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  console.log(`[mcp-client] tools=${toolNames.join(",")}`);

  if (!toolNames.includes(analyzeTransactionToolName)) {
    throw new Error(`Missing MCP tool: ${analyzeTransactionToolName}`);
  }

  await runScenario({
    label: "safe-transfer",
    expectedVerdict: "ALLOW",
    request: safeTransferRequest()
  });
  await runScenario({
    label: "malicious-approval",
    expectedVerdict: "BLOCK",
    request: maliciousApprovalRequest()
  });

  console.log("[mcp-client] complete scenarios=2 failures=0");
} finally {
  await client.close();
}

async function runScenario(input: {
  label: string;
  expectedVerdict: Verdict;
  request: AnalysisRequest;
}): Promise<void> {
  const report = await callAnalyzeTransaction(input.request);
  const passed = report.verdict === input.expectedVerdict;
  const status = passed ? "PASS" : "FAIL";

  console.log(
    `[${status}] ${input.label} expected=${input.expectedVerdict} actual=${report.verdict} risk=${report.riskScore} action=${report.actionType}`
  );
  console.log(`       summary=${report.summary}`);
  console.log(`       recommendedAction=${report.recommendedAction}`);
  console.log(`       hash=${report.reportHash}`);

  if (!passed) {
    throw new Error(
      `${input.label} expected ${input.expectedVerdict} but received ${report.verdict}`
    );
  }
}

async function callAnalyzeTransaction(request: AnalysisRequest): Promise<SecurityReport> {
  const result = await client.callTool({
    name: analyzeTransactionToolName,
    arguments: request as unknown as Record<string, unknown>
  });

  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error("MCP tool returned an unsupported result shape.");
  }

  const textContent = result.content.find(isTextContent);
  if (!textContent) {
    throw new Error("MCP tool did not return a text JSON report.");
  }

  return JSON.parse(textContent.text) as SecurityReport;
}

function isTextContent(content: unknown): content is { type: "text"; text: string } {
  return (
    typeof content === "object" &&
    content !== null &&
    "type" in content &&
    content.type === "text" &&
    "text" in content &&
    typeof content.text === "string"
  );
}

function safeTransferRequest(): AnalysisRequest {
  return {
    requestId: "mcp-demo-safe-transfer",
    intent: {
      action: "token_transfer",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      recipient: RECIPIENT,
      amount: "1000000",
      description: "MCP demo: safe agent ERC-20 transfer."
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Transfer(RECIPIENT, 1_000_000n)
    }
  };
}

function maliciousApprovalRequest(): AnalysisRequest {
  return {
    requestId: "mcp-demo-malicious-approval",
    intent: {
      action: "approval",
      chainId: CHAIN_ID,
      from: FROM,
      tokenAddress: TOKEN,
      spender: SPENDER,
      maxAmount: MAX_UINT256.toString(),
      description: "MCP demo: malicious unlimited ERC-20 approval."
    },
    transaction: {
      chainId: CHAIN_ID,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Approve(SPENDER, MAX_UINT256)
    }
  };
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
