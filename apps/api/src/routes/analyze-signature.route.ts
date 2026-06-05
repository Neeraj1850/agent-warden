import { Router } from "express";
import type { SignatureSecurityReport } from "@agent-warden/types";
import { analyzeSignatureRequest } from "../services/analysis.service.js";
import { jsonStringify, responseLocals } from "../server.js";

export function createAnalyzeSignatureRouter(): Router {
  const router = Router();

  router.post("/analyze-signature", (request, response, next) => {
    try {
      const report = analyzeSignatureRequest(request.body);
      logReport(responseLocals(request).requestId, report);

      response.status(200).type("application/json").send(jsonStringify(report));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function logReport(requestId: string, report: SignatureSecurityReport): void {
  console.log(
    `[api] signature-analysis ${requestId} verdict=${report.verdict} risk=${report.riskScore} hash=${report.reportHash}`
  );
}
