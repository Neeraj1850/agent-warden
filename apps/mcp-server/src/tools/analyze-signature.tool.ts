import type { SignatureAnalysisRequest } from "@agent-warden/types";
import { LocalAnalysisClient, type AnalysisClient } from "../clients/analysis-client.js";
import { analyzeSignatureInputSchema } from "../schemas/mcp.schemas.js";

export const analyzeSignatureToolName = "analyze_signature";

export const analyzeSignatureToolDescription =
  "Analyze EIP-712, personal_sign, or eth_sign payloads before an AI agent signs off-chain data.";

export const analyzeSignatureToolInputSchema = analyzeSignatureInputSchema;

export async function executeAnalyzeSignatureTool(
  input: SignatureAnalysisRequest,
  client: AnalysisClient = new LocalAnalysisClient()
) {
  const { report, payment } = await client.analyzeSignature(input);
  console.error(
    `[mcp] analyze_signature verdict=${report.verdict} risk=${report.riskScore} hash=${report.reportHash}`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(report, null, 2)
      }
    ],
    isError: report.verdict === "BLOCK",
    ...(payment ? { _meta: { payment } } : {})
  };
}
