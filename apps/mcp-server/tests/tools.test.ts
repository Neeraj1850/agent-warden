import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

describe("MCP server tool discovery", () => {
  it("describes policy profile tools", async () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const serverEntrypoint = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const serverSource = join(repoRoot, "apps", "mcp-server", "src", "index.ts");
    const { stdout } = await execFileAsync(process.execPath, [
      serverEntrypoint,
      serverSource,
      "--describe"
    ]);
    const description = JSON.parse(stdout) as {
      tools: Array<{ name: string }>;
    };
    const toolNames = description.tools.map((tool) => tool.name);

    assert.ok(toolNames.includes("list_policy_profiles"));
    assert.ok(toolNames.includes("get_policy_profile"));
  });
});
