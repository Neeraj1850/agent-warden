export interface ApiEnv {
  port: number;
  x402Enabled: boolean;
  x402Provider: "mock" | "arc-gateway" | "standard";
  x402PayTo: `0x${string}` | "";
  x402AcceptedNetworks: string[];
  x402Price: string;
  x402GatewayFacilitatorUrl: string;
  x402StandardFacilitatorUrl: string;
  x402ChallengeTtlMs: number;
  analysisRpcUrl?: string;
  analysisRpcTimeoutMs: number;
  simulationMode?: "static" | "eth_call" | "anvil";
  anvilRpcUrl?: string;
  simulationTimeoutMs: number;
  groqApiKey?: string;
  groqModel: string;
  reportStoreDir?: string;
}

export function getEnv(): ApiEnv {
  const provider = resolveX402Provider(process.env.X402_PROVIDER, process.env.X402_MODE);

  return {
    port: Number(process.env.PORT ?? 8787),
    x402Enabled: process.env.X402_ENABLED === "true",
    x402Provider: provider,
    x402PayTo: (process.env.X402_PAY_TO ?? "") as `0x${string}` | "",
    x402AcceptedNetworks: (process.env.X402_ACCEPTED_NETWORKS ?? "eip155:5042002")
      .split(",")
      .map((network) => network.trim())
      .filter(Boolean),
    x402Price: process.env.X402_PRICE ?? "$0.001",
    x402GatewayFacilitatorUrl:
      process.env.X402_GATEWAY_FACILITATOR_URL ??
      "https://gateway-api-testnet.circle.com",
    x402StandardFacilitatorUrl:
      process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    x402ChallengeTtlMs: Number(process.env.X402_CHALLENGE_TTL_MS ?? 5 * 60_000),
    analysisRpcUrl: optionalEnv(process.env.ANALYSIS_RPC_URL),
    analysisRpcTimeoutMs: Number(process.env.ANALYSIS_RPC_TIMEOUT_MS ?? 3_000),
    simulationMode: optionalSimulationMode(process.env.SIMULATION_MODE),
    anvilRpcUrl: optionalEnv(process.env.ANVIL_RPC_URL),
    simulationTimeoutMs: Number(process.env.SIMULATION_TIMEOUT_MS ?? 10_000),
    groqApiKey: optionalEnv(process.env.GROQ_API_KEY),
    groqModel: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
    reportStoreDir: optionalEnv(process.env.REPORT_STORE_DIR)
  };
}

function resolveX402Provider(
  provider: string | undefined,
  legacyMode: string | undefined
): ApiEnv["x402Provider"] {
  if (provider === "mock" || provider === "arc-gateway" || provider === "standard") {
    return provider;
  }

  return legacyMode === "real" ? "standard" : "mock";
}

function optionalEnv(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function optionalSimulationMode(value: string | undefined): ApiEnv["simulationMode"] {
  if (value === "static" || value === "eth_call" || value === "anvil") {
    return value;
  }

  return undefined;
}
