import type {
  AnalysisRequest,
  SecurityReport,
  VerifyReportRequest,
  VerifyReportResponse
} from "../types/report.types.js";
import type {
  SignatureAnalysisRequest,
  SignatureSecurityReport
} from "../types/signature.types.js";
import { hashObject } from "../utils/hashing.js";
import { validateAnalysisRequest } from "../utils/validation.js";

export function verifyReportHash(request: VerifyReportRequest): VerifyReportResponse {
  if (request.kind === "transaction") {
    const expectedHash = computeTransactionReportHash(request.request, request.report);

    return {
      valid: expectedHash === request.report.reportHash,
      expectedHash,
      actualHash: request.report.reportHash
    };
  }

  const expectedHash = computeSignatureReportHash(request.request, request.report);

  return {
    valid: expectedHash === request.report.reportHash,
    expectedHash,
    actualHash: request.report.reportHash
  };
}

export function computeTransactionReportHash(
  request: AnalysisRequest,
  report: SecurityReport
): string {
  const normalizedRequest = validateAnalysisRequest(request);
  const { reportHash: _reportHash, ...reportWithoutHash } = report;

  return hashObject({
    intent: normalizedRequest.intent,
    transaction: normalizedRequest.transaction,
    profileId: normalizedRequest.profileId,
    policyProfile: normalizedRequest.policyProfile,
    report: reportWithoutHash
  });
}

export function computeSignatureReportHash(
  request: SignatureAnalysisRequest,
  report: SignatureSecurityReport
): string {
  const { reportHash: _reportHash, ...reportWithoutHash } = report;

  return hashObject({
    intent: normalizeSignatureIntent(request),
    payload: request.payload,
    report: reportWithoutHash
  });
}

function normalizeSignatureIntent(request: SignatureAnalysisRequest) {
  return {
    ...request.intent,
    from: request.intent.from.toLowerCase(),
    verifyingContract: request.intent.verifyingContract?.toLowerCase(),
    spender: request.intent.spender?.toLowerCase()
  };
}
