import {
  analyzeSignature,
  analyzeTransaction,
  applyAdditionalPolicyViolations,
  evaluateStatePolicies,
  type SecurityReport,
  type SignatureSecurityReport,
  type Verdict
} from "@agent-warden/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoPayloads, type DemoPayload } from "./payloads.js";

const mode = process.argv.includes("--api") ? "api" : "local";
const apiUrl = process.env.AGENTWARDEN_API_URL ?? "http://localhost:8787/analyze";
const shouldWriteArtifacts = !process.argv.includes("--no-artifacts");
const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const resultsDir = join(packageDir, "results");

console.log(`[attack-payloads] mode=${mode}`);
if (mode === "api") {
  console.log(`[attack-payloads] api=${apiUrl}`);
}

let failures = 0;
const results: PayloadRunResult[] = [];

for (const payload of demoPayloads) {
  const report =
    mode === "api" ? await analyzeViaApi(apiUrl, payload) : analyzeLocal(payload);
  const passed = report.verdict === payload.expectedVerdict;

  if (!passed) {
    failures += 1;
  }

  printResult(payload, report, passed);
  results.push({ payload, report, passed });
}

if (shouldWriteArtifacts) {
  writeArtifacts(results, mode);
}

console.log(
  `[attack-payloads] complete total=${demoPayloads.length} failures=${failures}`
);

if (failures > 0) {
  process.exitCode = 1;
}

function analyzeLocal(payload: DemoPayload): DemoReport {
  const report =
    payload.kind === "signature"
      ? analyzeSignature(payload.request as Parameters<typeof analyzeSignature>[0])
      : analyzeTransaction(payload.request as Parameters<typeof analyzeTransaction>[0]);

  return applyStateSnapshot(payload, report);
}

async function analyzeViaApi(url: string, payload: DemoPayload): Promise<DemoReport> {
  const targetUrl =
    payload.kind === "signature" ? url.replace(/\/analyze$/, "/analyze-signature") : url;
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": payload.request.requestId ?? payload.id,
      "x-agentwarden-mock-payment": "paid"
    },
    body: JSON.stringify(payload.request)
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `AgentWarden API rejected ${payload.id}: ${response.status} ${responseText}`
    );
  }

  return applyStateSnapshot(payload, JSON.parse(responseText) as DemoReport);
}

function printResult(payload: DemoPayload, report: DemoReport, passed: boolean): void {
  const status = passed ? "PASS" : "FAIL";
  const violations = report.policyViolations.map((violation) => violation.code).join(",");

  console.log(
    `[${status}] ${payload.id} source=${payload.source} kind=${payload.kind ?? "transaction"} expected=${payload.expectedVerdict} actual=${report.verdict} risk=${report.riskScore} action=${report.actionType}`
  );

  if (violations) {
    console.log(`       violations=${violations}`);
  }

  if (!passed) {
    console.log(`       title=${payload.title}`);
    console.log(`       hash=${report.reportHash}`);
  }
}

interface PayloadRunResult {
  payload: DemoPayload;
  report: DemoReport;
  passed: boolean;
}

type DemoReport = SecurityReport | SignatureSecurityReport;

function applyStateSnapshot(payload: DemoPayload, report: DemoReport): DemoReport {
  if (
    payload.kind === "signature" ||
    !payload.stateSnapshot ||
    !isSecurityReport(report)
  ) {
    return report;
  }

  const request = payload.request as Parameters<typeof analyzeTransaction>[0];
  const stateViolations = evaluateStatePolicies(request, report, payload.stateSnapshot);
  return applyAdditionalPolicyViolations(request, report, stateViolations, {
    stateSnapshot: payload.stateSnapshot,
    stateViolations
  });
}

function writeArtifacts(results: PayloadRunResult[], runMode: string): void {
  mkdirSync(resultsDir, { recursive: true });

  const jsonPath = join(resultsDir, "demo-report.json");
  const markdownPath = join(resultsDir, "demo-report.md");
  const generatedAt =
    process.env.AGENTWARDEN_REPORT_GENERATED_AT ?? "deterministic-local-run";
  const failures = results.filter((result) => !result.passed).length;
  const artifact = {
    generatedAt,
    mode: runMode,
    total: results.length,
    failures,
    results: results.map(({ payload, report, passed }) => ({
      id: payload.id,
      title: payload.title,
      source: payload.source,
      expectedVerdict: payload.expectedVerdict,
      passed,
      request: payload.request,
      report
    }))
  };

  writeFileSync(jsonPath, `${JSON.stringify(artifact, jsonReplacer, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdownReport(artifact));
  console.log(`[attack-payloads] wrote ${relativeResultPath(jsonPath)}`);
  console.log(`[attack-payloads] wrote ${relativeResultPath(markdownPath)}`);
}

function renderMarkdownReport(artifact: {
  generatedAt: string;
  mode: string;
  total: number;
  failures: number;
  results: Array<{
    id: string;
    title: string;
    source: string;
    expectedVerdict: Verdict;
    passed: boolean;
    report: DemoReport;
  }>;
}): string {
  const lines = [
    "# AgentWarden Attack Payload Report",
    "",
    `Generated: ${artifact.generatedAt}`,
    `Mode: ${artifact.mode}`,
    `Total: ${artifact.total}`,
    `Failures: ${artifact.failures}`,
    "",
    "| Payload | Source | Expected | Actual | Risk | Action | Result |",
    "| --- | --- | --- | --- | ---: | --- | --- |",
    ...artifact.results.map(
      (result) =>
        `| ${[
          escapeCell(result.id),
          escapeCell(result.source),
          result.expectedVerdict,
          result.report.verdict,
          result.report.riskScore,
          escapeCell(result.report.actionType),
          result.passed ? "PASS" : "FAIL"
        ].join(" | ")} |`
    ),
    ""
  ];

  for (const result of artifact.results) {
    lines.push(
      `## ${result.title}`,
      "",
      `Payload: \`${result.id}\``,
      `Source: ${result.source}`,
      `Verdict: ${result.report.verdict}`,
      `Risk score: ${result.report.riskScore}`,
      `Action: ${result.report.actionType}`,
      `Report hash: \`${result.report.reportHash}\``,
      "",
      `Summary: ${reportSummary(result.report)}`,
      "",
      reportExplanation(result.report),
      "",
      "Findings:"
    );

    const findings = reportFindings(result.report);
    if (findings.length === 0) {
      lines.push("- None");
    } else {
      for (const finding of findings) {
        const evidence = finding.evidence.length
          ? ` Evidence: ${finding.evidence.join(", ")}.`
          : "";
        lines.push(
          `- ${finding.severity.toUpperCase()} ${finding.code}: ${finding.detail}${evidence}`
        );
      }
    }

    lines.push("", `Recommended action: ${reportRecommendedAction(result.report)}`, "");
  }

  return `${lines.join("\n")}\n`;
}

function isSecurityReport(report: DemoReport): report is SecurityReport {
  return "summary" in report;
}

function reportSummary(report: DemoReport): string {
  return isSecurityReport(report)
    ? report.summary
    : `${report.verdict}: ${report.actionType} classified as risk ${report.riskScore}.`;
}

function reportExplanation(report: DemoReport): string {
  if (isSecurityReport(report)) {
    return report.explanation;
  }

  if (report.policyViolations.length === 0) {
    return "AgentWarden found no deterministic signature policy violations.";
  }

  return `AgentWarden found ${report.policyViolations.length} signature issue(s). Primary finding: ${report.policyViolations[0]?.message}`;
}

function reportFindings(report: DemoReport): Array<{
  severity: string;
  code: string;
  detail: string;
  evidence: string[];
}> {
  if (isSecurityReport(report)) {
    return report.findings;
  }

  return report.policyViolations.map((violation) => ({
    severity: violation.severity,
    code: violation.code,
    detail: violation.message,
    evidence: [violation.expected, violation.actual].filter(
      (value): value is string => value !== undefined
    )
  }));
}

function reportRecommendedAction(report: DemoReport): string {
  return isSecurityReport(report)
    ? report.recommendedAction
    : (report.saferAlternative ??
        "Proceed only if the signature intent is explicit and bounded.");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

function relativeResultPath(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}
