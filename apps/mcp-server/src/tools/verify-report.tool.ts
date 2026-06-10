import { verifyReportHash, type VerifyReportRequest } from "@agent-warden/core";
import { verifyReportInputSchema } from "../schemas/mcp.schemas.js";

export const verifyReportToolName = "verify_report";

export const verifyReportToolDescription =
  "Verify a completed AgentWarden report hash against the original request context.";

export const verifyReportToolInputSchema = verifyReportInputSchema;

export async function executeVerifyReportTool(input: VerifyReportRequest) {
  const result = verifyReportHash(input);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }
    ],
    isError: !result.valid
  };
}
