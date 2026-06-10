import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LocalReputationProvider,
  EthersChainStateProvider,
  AnvilSimulator,
  EthCallSimulator,
  StaticSimulator,
  type AnalysisRequest,
  type ChainStateProvider,
  type ChainStateSnapshot,
  type ReportExplainer,
  type SecurityReport,
  type SimulationResult,
  type TransactionSimulator
} from "@agent-warden/core";
import { createApiServer } from "../src/server.js";
import {
  createDefaultChainStateProvider,
  createDefaultTransactionSimulator
} from "../src/services/analysis.service.js";
import type { ReportStore, StoredReport } from "../src/services/report-store.service.js";
import type { ApiEnv } from "../src/config/env.js";

const FROM = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const SPENDER = "0x4444444444444444444444444444444444444444";
const MAX_UINT256 = (1n << 256n) - 1n;

describe("AgentWarden API", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = await createApiServer(testEnv());
    server = app.listen(0);
    await onceListening(server);
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await closeServer(server);
  });

  it("returns health status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as { status: string; service: string };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "agent-warden-api");
  });

  it("allows safe transaction analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      requestId: "safe-transfer",
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "ALLOW");
    assert.equal(body.actionType, "erc20_transfer");
  });

  it("blocks malicious approval transaction analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      requestId: "bad-approval",
      intent: {
        action: "approval",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Approve(SPENDER, MAX_UINT256)
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.equal(body.actionType, "erc20_approval");
  });

  it("blocks an approval followed by a transfer in the same signer session", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      requestId: "approval-follow-up",
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.ok(
      body.policyViolations.some(
        (violation: { code: string }) => violation.code === "RECENT_APPROVAL_SEQUENCE"
      )
    );
  });

  it("blocks a target in the local risky-address registry", async () => {
    const riskyRecipient = "0x5555555555555555555555555555555555555555";
    const app = await createApiServer(testEnv(), {
      reputationProvider: new LocalReputationProvider({
        riskyAddresses: {
          [riskyRecipient]: "Known local test threat."
        }
      })
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, {
        requestId: "risky-native-transfer",
        intent: {
          action: "native_transfer",
          chainId: 5042002,
          from: FROM,
          recipient: riskyRecipient,
          amount: "1",
          allowNativeValue: true
        },
        transaction: {
          chainId: 5042002,
          from: FROM,
          to: riskyRecipient,
          value: "1",
          data: "0x"
        }
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, "BLOCK");
      assert.ok(
        body.policyViolations.some(
          (violation: { code: string }) => violation.code === "LOCAL_RISKY_ADDRESS"
        )
      );
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("includes a state snapshot when a chain-state provider is injected", async () => {
    const app = await createApiServer(testEnv(), {
      chainStateProvider: new StaticChainStateProvider({
        erc20: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            balance: "10"
          }
        ]
      })
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, {
        requestId: "state-safe-transfer",
        intent: {
          action: "token_transfer",
          chainId: 5042002,
          from: FROM,
          tokenAddress: TOKEN,
          recipient: RECIPIENT,
          amount: "1"
        },
        transaction: {
          chainId: 5042002,
          from: FROM,
          to: TOKEN,
          value: "0",
          data: encodeErc20Transfer(RECIPIENT, 1n)
        }
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, "ALLOW");
      assert.equal(body.stateSnapshot.erc20[0].balance, "10");
      assert.deepEqual(body.stateFindings, []);
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("blocks unsafe transfer with insufficient injected state", async () => {
    const app = await createApiServer(testEnv(), {
      chainStateProvider: new StaticChainStateProvider({
        erc20: [
          {
            tokenAddress: TOKEN,
            owner: FROM,
            balance: "0"
          }
        ]
      })
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, {
        requestId: "state-unsafe-transfer",
        intent: {
          action: "token_transfer",
          chainId: 5042002,
          from: FROM,
          tokenAddress: TOKEN,
          recipient: RECIPIENT,
          amount: "1"
        },
        transaction: {
          chainId: 5042002,
          from: FROM,
          to: TOKEN,
          value: "0",
          data: encodeErc20Transfer(RECIPIENT, 1n)
        }
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, "BLOCK");
      assert.ok(
        body.policyViolations.some(
          (violation: { code: string }) => violation.code === "INSUFFICIENT_TOKEN_BALANCE"
        )
      );
      assert.ok(
        body.stateFindings.some(
          (finding: { code: string }) => finding.code === "INSUFFICIENT_TOKEN_BALANCE"
        )
      );
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("uses ethers as the default chain-state provider when RPC is configured", () => {
    const provider = createDefaultChainStateProvider({
      analysisRpcUrl: "http://127.0.0.1:8545",
      analysisRpcTimeoutMs: 3_000
    });

    assert.ok(provider instanceof EthersChainStateProvider);
  });

  it("uses simulation provider selection from env", () => {
    assert.ok(
      createDefaultTransactionSimulator({
        simulationMode: "static",
        simulationTimeoutMs: 10_000
      }) instanceof StaticSimulator
    );
    assert.ok(
      createDefaultTransactionSimulator({
        analysisRpcUrl: "http://127.0.0.1:8545",
        simulationTimeoutMs: 10_000
      }) instanceof EthCallSimulator
    );
    assert.ok(
      createDefaultTransactionSimulator({
        simulationMode: "anvil",
        anvilRpcUrl: "http://127.0.0.1:8545",
        analysisRpcUrl: "http://127.0.0.1:9545",
        simulationTimeoutMs: 10_000
      }) instanceof AnvilSimulator
    );
  });

  it("includes injected simulation evidence in analysis responses", async () => {
    const app = await createApiServer(testEnv(), {
      transactionSimulator: new FixedSimulator({
        status: "failed",
        engine: "anvil",
        failureCode: "reverted",
        summary: "reverted",
        revertReason: "forced test revert",
        balanceDeltas: []
      })
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, {
        requestId: "sim-revert",
        intent: {
          action: "token_transfer",
          chainId: 5042002,
          from: FROM,
          tokenAddress: TOKEN,
          recipient: RECIPIENT,
          amount: "1"
        },
        transaction: {
          chainId: 5042002,
          from: FROM,
          to: TOKEN,
          value: "0",
          data: encodeErc20Transfer(RECIPIENT, 1n)
        }
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, "BLOCK");
      assert.equal(body.simulationResult.engine, "anvil");
      assert.equal(body.simulationResult.failureCode, "reverted");
      assert.ok(
        body.policyViolations.some(
          (violation: { code: string }) => violation.code === "SIMULATION_REVERTED"
        )
      );
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("accepts profileId on analysis requests", async () => {
    const { status, body } = await postAnalyzeIsolated({
      requestId: "api-profile-id",
      profileId: "strict-treasury",
      intent: {
        action: "approval",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER,
        expectedOutcome: {
          approvals: [
            {
              standard: "erc20",
              tokenAddress: TOKEN,
              spender: SPENDER,
              maxAmount: "1"
            }
          ]
        }
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Approve(SPENDER, 1n)
      }
    });

    assert.equal(status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.ok(hasViolation(body, "PROFILE_APPROVAL_BLOCKED"));
  });

  it("accepts inline policyProfile on analysis requests", async () => {
    const { status, body } = await postAnalyzeIsolated({
      requestId: "api-inline-profile",
      policyProfile: paymentProfile(),
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1",
        expectedOutcome: {
          recipients: [RECIPIENT],
          tokenOutflows: [
            {
              assetStandard: "erc20",
              tokenAddress: TOKEN,
              recipient: RECIPIENT,
              amount: "1"
            }
          ],
          allowUnknownLogs: false
        }
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });

    assert.equal(status, 200);
    assert.equal(body.verdict, "ALLOW");
  });

  it("returns 400 for malformed inline policyProfile", async () => {
    const { status, body } = await postAnalyzeIsolated({
      requestId: "api-bad-profile",
      policyProfile: {
        profileId: "bad",
        name: "Bad",
        mode: "reckless"
      },
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });

    assert.equal(status, 400);
    assert.equal(body.error, "Bad request");
    assert.match(body.message, /policyProfile\.mode/);
  });

  it("blocks when inline policyProfile requires expected outcome", async () => {
    const { status, body } = await postAnalyzeIsolated({
      requestId: "api-profile-missing-outcome",
      policyProfile: paymentProfile(),
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    });

    assert.equal(status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.ok(hasViolation(body, "PROFILE_EXPECTED_OUTCOME_REQUIRED"));
  });

  it("changes report hash when profile changes", async () => {
    const baseRequest = {
      requestId: "api-profile-hash",
      intent: {
        action: "token_transfer",
        chainId: 5042002,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1"
      },
      transaction: {
        chainId: 5042002,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    };
    const withoutProfile = await postAnalyzeIsolated(baseRequest);
    const withProfile = await postAnalyzeIsolated({
      ...baseRequest,
      policyProfile: {
        profileId: "hash-only-profile",
        name: "Hash Only Profile",
        mode: "balanced"
      }
    });

    assert.equal(withoutProfile.status, 200);
    assert.equal(withProfile.status, 200);
    assert.notEqual(withoutProfile.body.reportHash, withProfile.body.reportHash);
  });

  it("preserves analyze behavior when report store is not configured", async () => {
    const { status, body } = await postAnalyzeIsolated(safeTransferBody("no-store"));

    assert.equal(status, 200);
    assert.equal(body.verdict, "ALLOW");
    assert.match(body.reportHash ?? "", /^0x[a-f0-9]{64}$/);
  });

  it("returns 500 when configured report persistence fails", async () => {
    const app = await createApiServer(testEnv(), {
      reportStore: new FailingReportStore()
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const response = await postJson(
        `http://127.0.0.1:${address.port}/analyze`,
        safeTransferBody("store-failure")
      );
      const body = (await response.json()) as { error: string; message: string };

      assert.equal(response.status, 500);
      assert.equal(body.error, "Internal server error");
      assert.match(body.message, /Report persistence failed/);
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("writes and retrieves transaction reports when report store is configured", async () => {
    await withReportStore(async ({ baseUrl, reportStoreDir }) => {
      const requestBody = safeTransferBody("stored-transaction");
      const response = await postJson(`${baseUrl}/analyze`, requestBody);
      const report = (await response.json()) as SecurityReport;
      const stored = JSON.parse(
        await readFile(join(reportStoreDir, `${report.reportHash}.json`), "utf8")
      ) as SecurityReport;
      const getResponse = await fetch(`${baseUrl}/reports/${report.reportHash}`);
      const retrieved = (await getResponse.json()) as SecurityReport;

      assert.equal(response.status, 200);
      assert.equal(stored.reportHash, report.reportHash);
      assert.equal(getResponse.status, 200);
      assert.equal(retrieved.reportHash, report.reportHash);
    });
  });

  it("writes signature reports when report store is configured", async () => {
    await withReportStore(async ({ baseUrl, reportStoreDir }) => {
      const response = await postJson(`${baseUrl}/analyze-signature`, {
        requestId: "stored-signature",
        intent: {
          action: "login",
          chainId: 5042002,
          from: FROM
        },
        payload: {
          kind: "personal_sign",
          message: "Sign in to AgentWarden with nonce 123."
        }
      });
      const report = (await response.json()) as { reportHash: string };
      const stored = JSON.parse(
        await readFile(join(reportStoreDir, `${report.reportHash}.json`), "utf8")
      ) as { reportHash: string };

      assert.equal(response.status, 200);
      assert.equal(stored.reportHash, report.reportHash);
    });
  });

  it("returns 404 for unknown persisted report hashes", async () => {
    await withReportStore(async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/reports/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
      );
      const body = (await response.json()) as { error: string };

      assert.equal(response.status, 404);
      assert.equal(body.error, "Not found");
    });
  });

  it("returns 400 for malformed report hashes", async () => {
    await withReportStore(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/reports/not-a-hash`);
      const body = (await response.json()) as { error: string };

      assert.equal(response.status, 400);
      assert.equal(body.error, "Bad request");
    });
  });

  it("verifies transaction reports through the API", async () => {
    await withReportStore(async ({ baseUrl }) => {
      const requestBody = safeTransferBody("verify-api");
      const analysisResponse = await postJson(`${baseUrl}/analyze`, requestBody);
      const report = (await analysisResponse.json()) as SecurityReport;
      const verifyResponse = await postJson(`${baseUrl}/verify-report`, {
        kind: "transaction",
        request: requestBody,
        report
      });
      const valid = (await verifyResponse.json()) as { valid: boolean };
      const invalidResponse = await postJson(`${baseUrl}/verify-report`, {
        kind: "transaction",
        request: requestBody,
        report: {
          ...report,
          riskScore: 0
        }
      });
      const invalid = (await invalidResponse.json()) as { valid: boolean };

      assert.equal(verifyResponse.status, 200);
      assert.equal(valid.valid, true);
      assert.equal(invalidResponse.status, 200);
      assert.equal(invalid.valid, false);
    });
  });

  it("returns 400 for malformed verify-report requests", async () => {
    const response = await postJson(`${baseUrl}/verify-report`, {
      kind: "transaction"
    });
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Bad request");
  });

  it("returns 400 when verify-report contains a malformed report hash", async () => {
    const response = await postJson(`${baseUrl}/verify-report`, {
      kind: "transaction",
      request: safeTransferBody("malformed-verify-hash"),
      report: {
        reportHash: "not-a-hash"
      }
    });
    const body = (await response.json()) as { error: string; message: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Bad request");
    assert.match(body.message, /report\.reportHash/);
  });

  it("blocks permit signature analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze-signature`, {
      requestId: "permit",
      intent: {
        action: "permit",
        chainId: 5042002,
        from: FROM,
        verifyingContract: TOKEN,
        spender: SPENDER,
        maxAmount: MAX_UINT256.toString()
      },
      payload: {
        kind: "eip712_typed_data",
        typedData: {
          domain: {
            name: "TestToken",
            chainId: 5042002,
            verifyingContract: TOKEN
          },
          primaryType: "Permit",
          message: {
            owner: FROM,
            spender: SPENDER,
            value: MAX_UINT256.toString(),
            deadline: "9999999999"
          }
        }
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.equal(body.actionType, "permit_signature");
  });

  it("allows login signature analysis", async () => {
    const response = await postJson(`${baseUrl}/analyze-signature`, {
      requestId: "login",
      intent: {
        action: "login",
        chainId: 5042002,
        from: FROM
      },
      payload: {
        kind: "personal_sign",
        message: "Sign in to AgentWarden with nonce 123."
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, "ALLOW");
    assert.equal(body.actionType, "login_signature");
  });

  it("explains a completed report with the safe fallback explainer", async () => {
    const report = sampleSecurityReport();
    const response = await postJson(`${baseUrl}/explain-report`, { report });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict, report.verdict);
    assert.equal(body.riskScore, report.riskScore);
    assert.equal(body.reportHash, report.reportHash);
    assert.equal(body.model, "safe-fallback");
    assert.match(body.explanation, /Deterministic policy engine returned ALLOW/);
    assert.match(body.safetyNotice, /non-authoritative/);
  });

  it("falls back to the safe explainer when the primary explainer fails", async () => {
    const app = await createApiServer(testEnv(), {
      reportExplainer: new FailingExplainer()
    });
    const isolatedServer = app.listen(0);
    await onceListening(isolatedServer);
    const address = isolatedServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server address");
    }

    try {
      const report = sampleSecurityReport();
      const response = await postJson(`http://127.0.0.1:${address.port}/explain-report`, {
        report
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.verdict, report.verdict);
      assert.equal(body.riskScore, report.riskScore);
      assert.equal(body.reportHash, report.reportHash);
      assert.equal(body.model, "safe-fallback");
    } finally {
      await closeServer(isolatedServer);
    }
  });

  it("returns 400 for malformed explain-report requests", async () => {
    const response = await postJson(`${baseUrl}/explain-report`, {
      report: {
        verdict: "ALLOW"
      }
    });
    const body = (await response.json()) as { error: string; message: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Bad request");
    assert.match(body.message, /report.riskScore/);
  });

  it("returns 400 for malformed analysis requests", async () => {
    const response = await postJson(`${baseUrl}/analyze`, {
      intent: {
        action: "token_transfer"
      }
    });
    const body = (await response.json()) as { error: string; message: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Bad request");
    assert.match(body.message, /Expected transaction to be an object/);
  });
});

function testEnv(): ApiEnv {
  return {
    port: 0,
    x402Enabled: false,
    x402Mode: "mock",
    x402PayTo: "",
    x402Network: "eip155:84532",
    x402Price: "$0.001",
    x402FacilitatorUrl: "https://x402.org/facilitator",
    analysisRpcTimeoutMs: 3_000,
    simulationTimeoutMs: 10_000,
    groqModel: "llama-3.1-8b-instant"
  };
}

class FixedSimulator implements TransactionSimulator {
  constructor(private readonly result: SimulationResult) {}

  async simulate(_request: AnalysisRequest): Promise<SimulationResult> {
    return this.result;
  }
}

class FailingExplainer implements ReportExplainer {
  readonly modelName = "failing-test-model";

  async explain(_report: SecurityReport): Promise<string> {
    throw new Error("forced explainer failure");
  }
}

class FailingReportStore implements ReportStore {
  async save(_report: StoredReport): Promise<string> {
    throw new Error("forced storage failure");
  }

  async get(_reportHash: string): Promise<StoredReport | undefined> {
    return undefined;
  }
}

class StaticChainStateProvider implements ChainStateProvider {
  constructor(private readonly overrides: Partial<ChainStateSnapshot>) {}

  async getSnapshot(
    request: AnalysisRequest,
    _report: SecurityReport
  ): Promise<ChainStateSnapshot> {
    return {
      chainId: request.transaction.chainId,
      blockTag: "latest",
      account: {
        address: request.transaction.from,
        nativeBalance: "1000000000000000000",
        nonce: 1
      },
      target: request.transaction.to
        ? {
            address: request.transaction.to,
            bytecode: "0x1234",
            isContract: true
          }
        : undefined,
      erc20: [],
      erc721: [],
      erc1155: [],
      lookupErrors: [],
      ...this.overrides
    };
  }
}

function onceListening(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.once("listening", resolve);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function postAnalyzeIsolated(body: unknown): Promise<{
  status: number;
  body: {
    error?: string;
    message?: string;
    verdict?: string;
    reportHash?: string;
    policyViolations?: Array<{ code: string }>;
  };
}> {
  const app = await createApiServer(testEnv());
  const isolatedServer = app.listen(0);
  await onceListening(isolatedServer);
  const address = isolatedServer.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected HTTP server address");
  }

  try {
    const response = await postJson(`http://127.0.0.1:${address.port}/analyze`, body);

    return {
      status: response.status,
      body: (await response.json()) as {
        error?: string;
        message?: string;
        verdict?: string;
        reportHash?: string;
        policyViolations?: Array<{ code: string }>;
      }
    };
  } finally {
    await closeServer(isolatedServer);
  }
}

async function withReportStore(
  callback: (input: { baseUrl: string; reportStoreDir: string }) => Promise<void>
): Promise<void> {
  const reportStoreDir = await mkdtemp(join(tmpdir(), "agent-warden-reports-"));
  const app = await createApiServer({
    ...testEnv(),
    reportStoreDir
  });
  const isolatedServer = app.listen(0);
  await onceListening(isolatedServer);
  const address = isolatedServer.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected HTTP server address");
  }

  try {
    await callback({
      baseUrl: `http://127.0.0.1:${address.port}`,
      reportStoreDir
    });
  } finally {
    await closeServer(isolatedServer);
    await rm(reportStoreDir, { recursive: true, force: true });
  }
}

function safeTransferBody(requestId: string) {
  return {
    requestId,
    intent: {
      action: "token_transfer",
      chainId: 5042002,
      from: FROM,
      tokenAddress: TOKEN,
      recipient: RECIPIENT,
      amount: "1"
    },
    transaction: {
      chainId: 5042002,
      from: FROM,
      to: TOKEN,
      value: "0",
      data: encodeErc20Transfer(RECIPIENT, 1n)
    }
  };
}

function hasViolation(
  report: { policyViolations?: Array<{ code: string }> },
  code: string
): boolean {
  return Boolean(report.policyViolations?.some((violation) => violation.code === code));
}

function paymentProfile() {
  return {
    profileId: "api-payment-profile",
    name: "API Payment Profile",
    mode: "strict",
    allowedChains: [5042002],
    allowedActions: ["token_transfer"],
    allowedRecipients: [RECIPIENT],
    allowedTokens: [TOKEN],
    maxTokenAmounts: [{ tokenAddress: TOKEN, maxAmount: "10" }],
    blockApprovals: true,
    blockOperatorApprovals: true,
    blockContractDeployments: true,
    blockUnknownContracts: true,
    requireExpectedOutcome: true
  };
}

function encodeErc20Transfer(recipient: string, amount: bigint): `0x${string}` {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}`;
}

function encodeErc20Approve(spender: string, amount: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeAddress(address: string): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function sampleSecurityReport(): SecurityReport {
  return {
    verdict: "ALLOW",
    riskScore: 5,
    riskVector: {
      contractRisk: 5,
      tokenRisk: 0,
      behaviorRisk: 0,
      intentDelta: 0,
      sanctionsRisk: 0,
      simulationRisk: 0
    },
    summary: "ALLOW: erc20 transfer classified as low risk.",
    explanation: "Static analyzer explanation.",
    findings: [],
    recommendedAction:
      "Proceed only if the signer recognizes the recipient, asset, amount, and target contract.",
    transactionEnvelope: {
      type: "legacy",
      chainId: 5042002,
      hasAccessList: false,
      hasAuthorizationList: false,
      hasBlobFields: false
    },
    actionType: "erc20_transfer",
    executionGraph: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          depth: 0,
          kind: "root",
          actionType: "erc20_transfer",
          functionName: "erc20.transfer",
          selector: "0xa9059cbb",
          evidence: [],
          warnings: []
        }
      ],
      edges: [],
      maxDepth: 0,
      hasNestedExecution: false,
      hasUnknownNode: false
    },
    decodedActions: [],
    assetDeltas: [],
    approvalFindings: [],
    decodedTransaction: {
      selector: "0xa9059cbb",
      functionName: "erc20.transfer",
      warnings: []
    },
    policyViolations: [],
    simulationResult: {
      status: "not_run",
      engine: "local-static",
      summary: "Simulation disabled.",
      balanceDeltas: []
    },
    reportHash: "0x1111111111111111111111111111111111111111111111111111111111111111"
  };
}
