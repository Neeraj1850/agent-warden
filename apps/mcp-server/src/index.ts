import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AnalysisRequest } from "@arc-warden/core";
import {
  analyzeTransactionToolDescription,
  analyzeTransactionToolInputSchema,
  analyzeTransactionToolName,
  executeAnalyzeTransactionTool
} from "./tools/analyze-transaction.tool.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "arc-warden",
    version: "0.1.0"
  });

  server.tool(
    analyzeTransactionToolName,
    analyzeTransactionToolDescription,
    analyzeTransactionToolInputSchema,
    async (input) => executeAnalyzeTransactionTool(input as AnalysisRequest)
  );

  return server;
}

if (process.argv.includes("--describe")) {
  console.log(
    JSON.stringify(
      {
        name: "arc-warden",
        transport: "stdio",
        tools: [
          {
            name: analyzeTransactionToolName,
            description: analyzeTransactionToolDescription
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
  console.error("[mcp] ArcWarden MCP server connected over stdio");
}
