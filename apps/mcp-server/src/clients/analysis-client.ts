import {
  analyzeSignature,
  analyzeTransactionWithSimulation,
  validateAnalysisRequest,
  validateSignatureRequest
} from "@agent-warden/core";
import {
  ARC_TESTNET_CHAIN,
  ARC_TESTNET_NETWORK,
  ArcGatewayPaidApiClient,
  type PaymentSettlementMetadata
} from "@agent-warden/x402";
import type {
  AnalysisRequest,
  SecurityReport,
  SignatureAnalysisRequest,
  SignatureSecurityReport
} from "@agent-warden/types";

export interface AnalysisClientResult<T> {
  report: T;
  payment?: PaymentSettlementMetadata;
}

export interface AnalysisClient {
  analyzeTransaction(
    request: AnalysisRequest
  ): Promise<AnalysisClientResult<SecurityReport>>;
  analyzeSignature(
    request: SignatureAnalysisRequest
  ): Promise<AnalysisClientResult<SignatureSecurityReport>>;
}

export class LocalAnalysisClient implements AnalysisClient {
  async analyzeTransaction(
    request: AnalysisRequest
  ): Promise<AnalysisClientResult<SecurityReport>> {
    return {
      report: await analyzeTransactionWithSimulation(request)
    };
  }

  async analyzeSignature(
    request: SignatureAnalysisRequest
  ): Promise<AnalysisClientResult<SignatureSecurityReport>> {
    return {
      report: analyzeSignature(request)
    };
  }
}

export class PaidApiAnalysisClient implements AnalysisClient {
  constructor(private readonly client: ArcGatewayPaidApiClient) {}

  async analyzeTransaction(
    request: AnalysisRequest
  ): Promise<AnalysisClientResult<SecurityReport>> {
    const normalized = validateAnalysisRequest(request);
    const result = await this.client.post<SecurityReport>("/analyze", normalized);
    return {
      report: result.data,
      payment: result.payment
    };
  }

  async analyzeSignature(
    request: SignatureAnalysisRequest
  ): Promise<AnalysisClientResult<SignatureSecurityReport>> {
    const normalized = validateSignatureRequest(request);
    const result = await this.client.post<SignatureSecurityReport>(
      "/analyze-signature",
      normalized
    );
    return {
      report: result.data,
      payment: result.payment
    };
  }
}

export function createAnalysisClientFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AnalysisClient {
  const mode = env.MCP_ANALYSIS_MODE ?? "local";
  if (mode === "local") {
    return new LocalAnalysisClient();
  }

  if (mode !== "paid-api") {
    throw new Error(`Unsupported MCP_ANALYSIS_MODE: ${mode}`);
  }

  const privateKey = requiredEnv(env, "X402_PAYER_PRIVATE_KEY");
  const payTo = requiredEnv(env, "X402_PAY_TO");
  const chain = env.X402_PAYER_CHAIN ?? ARC_TESTNET_CHAIN;
  if (chain !== ARC_TESTNET_CHAIN) {
    throw new Error("MCP paid-api V1 supports X402_PAYER_CHAIN=arcTestnet only");
  }

  return new PaidApiAnalysisClient(
    new ArcGatewayPaidApiClient({
      apiUrl: env.AGENTWARDEN_API_URL ?? "http://localhost:8787",
      payTo,
      network: (env.X402_ACCEPTED_NETWORKS ?? ARC_TESTNET_NETWORK).split(",")[0].trim(),
      chain,
      privateKey: privateKey as `0x${string}`,
      maxPrice: env.X402_MAX_PRICE ?? "$0.01",
      timeoutMs: Number(env.X402_PAYMENT_TIMEOUT_MS ?? 15_000)
    })
  );
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when MCP_ANALYSIS_MODE=paid-api`);
  }
  return value;
}
