import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LocalAnalysisClient,
  createAnalysisClientFromEnv,
  type AnalysisClient
} from "../src/clients/analysis-client.js";
import { executeAnalyzeTransactionTool } from "../src/tools/analyze-transaction.tool.js";
import type { AnalysisRequest, SecurityReport } from "@agent-warden/types";

const execFileAsync = promisify(execFile);

describe("MCP server tool discovery", () => {
  it("describes policy profile tools", async () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const serverEntrypoint = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const serverSource = join(repoRoot, "apps", "mcp-server", "src", "index.ts");
    const { stdout } = await execFileAsync(process.execPath, [
      serverEntrypoint,
      serverSource,
      "--describe"
    ]);
    const description = JSON.parse(stdout) as {
      tools: Array<{ name: string }>;
    };
    const toolNames = description.tools.map((tool) => tool.name);

    assert.ok(toolNames.includes("list_policy_profiles"));
    assert.ok(toolNames.includes("get_policy_profile"));
    assert.ok(toolNames.includes("verify_report"));
    assert.ok(toolNames.includes("get_report"));
  });
});

describe("MCP analysis modes", () => {
  it("defaults to deterministic local mode without an API or payer", () => {
    assert.ok(createAnalysisClientFromEnv({}) instanceof LocalAnalysisClient);
  });

  it("fails closed when paid mode lacks payer configuration", () => {
    assert.throws(
      () => createAnalysisClientFromEnv({ MCP_ANALYSIS_MODE: "paid-api" }),
      /X402_PAYER_PRIVATE_KEY/
    );
  });

  it("returns bounded payment metadata without raw authorization data", async () => {
    const client: AnalysisClient = {
      async analyzeTransaction() {
        return {
          report: safeReport(),
          payment: {
            provider: "arc-gateway",
            payer: "0x5555555555555555555555555555555555555555",
            amount: "1000",
            network: "eip155:5042002",
            transferId: "gateway-transfer"
          }
        };
      },
      async analyzeSignature() {
        throw new Error("not used");
      }
    };

    const result = await executeAnalyzeTransactionTool(safeRequest(), client);
    assert.deepEqual(result._meta, {
      payment: {
        provider: "arc-gateway",
        payer: "0x5555555555555555555555555555555555555555",
        amount: "1000",
        network: "eip155:5042002",
        transferId: "gateway-transfer"
      }
    });
    assert.doesNotMatch(JSON.stringify(result._meta), /signature|privateKey/i);
  });
});

function safeRequest(): AnalysisRequest {
  return {
    intent: {
      action: "token_transfer",
      chainId: 5042002,
      from: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0x2222222222222222222222222222222222222222",
      recipient: "0x3333333333333333333333333333333333333333",
      amount: "1"
    },
    transaction: {
      chainId: 5042002,
      from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222",
      value: "0",
      data: "0xa9059cbb00000000000000000000000033333333333333333333333333333333333333330000000000000000000000000000000000000000000000000000000000000001"
    }
  };
}

function safeReport(): SecurityReport {
  return {
    verdict: "ALLOW",
    riskScore: 0,
    riskVector: {
      contractRisk: 0,
      tokenRisk: 0,
      behaviorRisk: 0,
      intentDelta: 0,
      sanctionsRisk: 0,
      simulationRisk: 0
    },
    summary: "Safe test report",
    explanation: "Safe test report",
    findings: [],
    recommendedAction: "Proceed.",
    transactionEnvelope: {
      type: "legacy",
      chainId: 5042002,
      hasAccessList: false,
      hasAuthorizationList: false,
      hasBlobFields: false
    },
    actionType: "erc20_transfer",
    executionGraph: {
      rootNodeId: "root",
      nodes: [],
      edges: [],
      maxDepth: 0,
      hasNestedExecution: false,
      hasUnknownNode: false
    },
    decodedActions: [],
    assetDeltas: [],
    approvalFindings: [],
    decodedTransaction: {
      selector: "0xa9059cbb",
      functionName: "erc20.transfer",
      warnings: []
    },
    policyViolations: [],
    simulationResult: {
      status: "not_run",
      engine: "local-static",
      summary: "Not run",
      balanceDeltas: []
    },
    reportHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };
}
