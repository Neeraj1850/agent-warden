import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getReportInputSchema } from "../schemas/mcp.schemas.js";

export const getReportToolName = "get_report";

export const getReportToolDescription =
  "Read a persisted AgentWarden report JSON file from REPORT_STORE_DIR.";

export const getReportToolInputSchema = getReportInputSchema;

export async function executeGetReportTool(input: { reportHash: string }) {
  const reportStoreDir = process.env.REPORT_STORE_DIR;

  if (!reportStoreDir) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "REPORT_STORE_DIR is not configured" }, null, 2)
        }
      ],
      isError: true
    };
  }

  try {
    const report = JSON.parse(
      await readFile(join(reportStoreDir, `${input.reportHash}.json`), "utf8")
    ) as unknown;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ report }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: "Report not found",
              reportHash: input.reportHash,
              message: error instanceof Error ? error.message : "Unknown read error"
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }
}
