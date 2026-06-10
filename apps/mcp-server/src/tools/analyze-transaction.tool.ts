import type { AnalysisRequest } from "@agent-warden/types";
import { LocalAnalysisClient, type AnalysisClient } from "../clients/analysis-client.js";
import { analyzeTransactionInputSchema } from "../schemas/mcp.schemas.js";

export const analyzeTransactionToolName = "analyze_transaction";

export const analyzeTransactionToolDescription =
  "Analyze structured intent and unsigned EVM transaction data before an AI agent signs or broadcasts it.";

export const analyzeTransactionToolInputSchema = analyzeTransactionInputSchema;

export async function executeAnalyzeTransactionTool(
  input: AnalysisRequest,
  client: AnalysisClient = new LocalAnalysisClient()
) {
  const { report, payment } = await client.analyzeTransaction(input);
  console.error(
    `[mcp] analyze_transaction verdict=${report.verdict} risk=${report.riskScore} hash=${report.reportHash}`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(report, bigintJsonReplacer, 2)
      }
    ],
    isError: report.verdict === "BLOCK",
    ...(payment ? { _meta: { payment } } : {})
  };
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
