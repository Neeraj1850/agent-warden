import { analyzeSignature } from "@agent-warden/core";
import type { SignatureAnalysisRequest } from "@agent-warden/types";
import { analyzeSignatureInputSchema } from "../schemas/mcp.schemas.js";

export const analyzeSignatureToolName = "analyze_signature";

export const analyzeSignatureToolDescription =
  "Analyze EIP-712, personal_sign, or eth_sign payloads before an AI agent signs off-chain data.";

export const analyzeSignatureToolInputSchema = analyzeSignatureInputSchema;

export async function executeAnalyzeSignatureTool(input: SignatureAnalysisRequest) {
  const report = analyzeSignature(input);
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
    isError: report.verdict === "BLOCK"
  };
}
