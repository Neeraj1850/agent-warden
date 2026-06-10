import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AnalysisRequest } from "@agent-warden/types";
import type { SignatureAnalysisRequest } from "@agent-warden/types";
import {
  analyzeSignatureToolDescription,
  analyzeSignatureToolInputSchema,
  analyzeSignatureToolName,
  executeAnalyzeSignatureTool
} from "./tools/analyze-signature.tool.js";
import {
  analyzeTransactionToolDescription,
  analyzeTransactionToolInputSchema,
  analyzeTransactionToolName,
  executeAnalyzeTransactionTool
} from "./tools/analyze-transaction.tool.js";
import {
  checkAddressToolDescription,
  checkAddressToolInputSchema,
  checkAddressToolName,
  executeCheckAddressTool
} from "./tools/check-address.tool.js";
import {
  decodeCalldataToolDescription,
  decodeCalldataToolInputSchema,
  decodeCalldataToolName,
  executeDecodeCalldataTool
} from "./tools/decode-calldata.tool.js";
import {
  executeGetPolicyTool,
  getPolicyToolDescription,
  getPolicyToolInputSchema,
  getPolicyToolName
} from "./tools/get-policy.tool.js";
import {
  executeGetReportTool,
  getReportToolDescription,
  getReportToolInputSchema,
  getReportToolName
} from "./tools/get-report.tool.js";
import {
  executeGetPolicyProfileTool,
  getPolicyProfileToolDescription,
  getPolicyProfileToolInputSchema,
  getPolicyProfileToolName
} from "./tools/get-policy-profile.tool.js";
import {
  executeListPolicyProfilesTool,
  listPolicyProfilesToolDescription,
  listPolicyProfilesToolInputSchema,
  listPolicyProfilesToolName
} from "./tools/list-policy-profiles.tool.js";
import {
  executeExplainReportTool,
  explainReportToolDescription,
  explainReportToolInputSchema,
  explainReportToolName
} from "./tools/explain-report.tool.js";
import {
  executeVerifyReportTool,
  verifyReportToolDescription,
  verifyReportToolInputSchema,
  verifyReportToolName
} from "./tools/verify-report.tool.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agent-warden",
    version: "0.1.0"
  });

  server.tool(
    analyzeTransactionToolName,
    analyzeTransactionToolDescription,
    analyzeTransactionToolInputSchema,
    async (input) => executeAnalyzeTransactionTool(input as AnalysisRequest)
  );
  server.tool(
    decodeCalldataToolName,
    decodeCalldataToolDescription,
    decodeCalldataToolInputSchema,
    async (input) =>
      executeDecodeCalldataTool(input as Parameters<typeof executeDecodeCalldataTool>[0])
  );
  server.tool(
    analyzeSignatureToolName,
    analyzeSignatureToolDescription,
    analyzeSignatureToolInputSchema,
    async (input) => executeAnalyzeSignatureTool(input as SignatureAnalysisRequest)
  );
  server.tool(
    getPolicyToolName,
    getPolicyToolDescription,
    getPolicyToolInputSchema,
    async () => executeGetPolicyTool()
  );
  server.tool(
    listPolicyProfilesToolName,
    listPolicyProfilesToolDescription,
    listPolicyProfilesToolInputSchema,
    async () => executeListPolicyProfilesTool()
  );
  server.tool(
    getPolicyProfileToolName,
    getPolicyProfileToolDescription,
    getPolicyProfileToolInputSchema,
    async (input) =>
      executeGetPolicyProfileTool(
        input as Parameters<typeof executeGetPolicyProfileTool>[0]
      )
  );
  server.tool(
    checkAddressToolName,
    checkAddressToolDescription,
    checkAddressToolInputSchema,
    async (input) =>
      executeCheckAddressTool(input as Parameters<typeof executeCheckAddressTool>[0])
  );
  server.tool(
    explainReportToolName,
    explainReportToolDescription,
    explainReportToolInputSchema,
    async (input) =>
      executeExplainReportTool(
        input as unknown as Parameters<typeof executeExplainReportTool>[0]
      )
  );
  server.tool(
    verifyReportToolName,
    verifyReportToolDescription,
    verifyReportToolInputSchema,
    async (input) =>
      executeVerifyReportTool(
        input as unknown as Parameters<typeof executeVerifyReportTool>[0]
      )
  );
  server.tool(
    getReportToolName,
    getReportToolDescription,
    getReportToolInputSchema,
    async (input) =>
      executeGetReportTool(input as Parameters<typeof executeGetReportTool>[0])
  );

  return server;
}

if (process.argv.includes("--describe")) {
  console.log(
    JSON.stringify(
      {
        name: "agent-warden",
        transport: "stdio",
        tools: [
          {
            name: analyzeTransactionToolName,
            description: analyzeTransactionToolDescription
          },
          {
            name: decodeCalldataToolName,
            description: decodeCalldataToolDescription
          },
          {
            name: analyzeSignatureToolName,
            description: analyzeSignatureToolDescription
          },
          {
            name: getPolicyToolName,
            description: getPolicyToolDescription
          },
          {
            name: listPolicyProfilesToolName,
            description: listPolicyProfilesToolDescription
          },
          {
            name: getPolicyProfileToolName,
            description: getPolicyProfileToolDescription
          },
          {
            name: checkAddressToolName,
            description: checkAddressToolDescription
          },
          {
            name: explainReportToolName,
            description: explainReportToolDescription
          },
          {
            name: verifyReportToolName,
            description: verifyReportToolDescription
          },
          {
            name: getReportToolName,
            description: getReportToolDescription
          }
        ]
      },
      null,
      2
    )
  );
} else {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("[mcp] AgentWarden MCP server connected over stdio");
}
