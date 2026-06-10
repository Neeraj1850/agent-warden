import { Router } from "express";
import {
  defaultAnalysisService,
  type AnalysisService
} from "../services/analysis.service.js";

export function createVerifyReportRouter(
  analysisService: AnalysisService = defaultAnalysisService
): Router {
  const router = Router();

  router.post("/verify-report", (request, response, next) => {
    try {
      const result = analysisService.verifyReportRequest(request.body);

      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
