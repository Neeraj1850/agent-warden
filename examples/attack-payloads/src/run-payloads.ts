import {
  analyzeTransaction,
  type SecurityReport,
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
    mode === "api"
      ? await analyzeViaApi(apiUrl, payload)
      : analyzeTransaction(payload.request);
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

async function analyzeViaApi(url: string, payload: DemoPayload): Promise<SecurityReport> {
  const response = await fetch(url, {
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

  return JSON.parse(responseText) as SecurityReport;
}

function printResult(
  payload: DemoPayload,
  report: SecurityReport,
  passed: boolean
): void {
  const status = passed ? "PASS" : "FAIL";
  const violations = report.policyViolations.map((violation) => violation.code).join(",");

  console.log(
    `[${status}] ${payload.id} source=${payload.source} expected=${payload.expectedVerdict} actual=${report.verdict} risk=${report.riskScore} action=${report.actionType}`
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
  report: SecurityReport;
  passed: boolean;
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
    report: SecurityReport;
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
      `Summary: ${result.report.summary}`,
      "",
      result.report.explanation,
      "",
      "Findings:"
    );

    if (result.report.findings.length === 0) {
      lines.push("- None");
    } else {
      for (const finding of result.report.findings) {
        const evidence = finding.evidence.length
          ? ` Evidence: ${finding.evidence.join(", ")}.`
          : "";
        lines.push(
          `- ${finding.severity.toUpperCase()} ${finding.code}: ${finding.detail}${evidence}`
        );
      }
    }

    lines.push("", `Recommended action: ${result.report.recommendedAction}`, "");
  }

  return `${lines.join("\n")}\n`;
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
