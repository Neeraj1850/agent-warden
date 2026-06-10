import { Router } from "express";
import {
  defaultAnalysisService,
  type AnalysisService
} from "../services/analysis.service.js";
import { jsonStringify } from "../server.js";

const REPORT_HASH_PATTERN = /^0x[a-f0-9]{64}$/;

export function createReportsRouter(
  analysisService: AnalysisService = defaultAnalysisService
): Router {
  const router = Router();

  router.get("/reports/:reportHash", async (request, response, next) => {
    try {
      const { reportHash } = request.params;

      if (!REPORT_HASH_PATTERN.test(reportHash)) {
        response.status(400).json({
          error: "Bad request",
          message: "Expected reportHash to be a 0x-prefixed 32-byte hash"
        });
        return;
      }

      const report = await analysisService.getReport(reportHash);
      if (!report) {
        response.status(404).json({
          error: "Not found",
          message: "Report not found"
        });
        return;
      }

      response.status(200).type("application/json").send(jsonStringify(report));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
