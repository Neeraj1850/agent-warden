import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SecurityReport, SignatureSecurityReport } from "@agent-warden/core";

export type StoredReport = SecurityReport | SignatureSecurityReport;

const REPORT_HASH_PATTERN = /^0x[a-f0-9]{64}$/;

export interface ReportStore {
  save(report: StoredReport): Promise<string>;
  get(reportHash: string): Promise<StoredReport | undefined>;
}

export class FileReportStore implements ReportStore {
  constructor(private readonly directory: string) {}

  async save(report: StoredReport): Promise<string> {
    const filePath = this.filePath(report.reportHash);
    await mkdir(this.directory, { recursive: true });
    await writeFile(filePath, JSON.stringify(report, bigintJsonReplacer, 2), "utf8");

    return filePath;
  }

  async get(reportHash: string): Promise<StoredReport | undefined> {
    const filePath = this.filePath(reportHash);

    try {
      return JSON.parse(await readFile(filePath, "utf8")) as StoredReport;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }

      throw error;
    }
  }

  private filePath(reportHash: string): string {
    if (!REPORT_HASH_PATTERN.test(reportHash)) {
      throw new Error("Expected report hash to be a 0x-prefixed 32-byte hash");
    }

    return join(this.directory, `${reportHash}.json`);
  }
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
