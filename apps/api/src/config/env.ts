export interface ApiEnv {
  port: number;
  x402Enabled: boolean;
  x402Mode: "mock" | "real";
  x402PayTo: `0x${string}` | "";
  x402Network: string;
  x402Price: string;
  x402FacilitatorUrl: string;
  analysisRpcUrl?: string;
  analysisRpcTimeoutMs: number;
  simulationMode?: "static" | "eth_call" | "anvil";
  anvilRpcUrl?: string;
  simulationTimeoutMs: number;
  groqApiKey?: string;
  groqModel: string;
}

export function getEnv(): ApiEnv {
  const mode = process.env.X402_MODE === "real" ? "real" : "mock";

  return {
    port: Number(process.env.PORT ?? 8787),
    x402Enabled: process.env.X402_ENABLED === "true",
    x402Mode: mode,
    x402PayTo: (process.env.X402_PAY_TO ?? "") as `0x${string}` | "",
    x402Network: process.env.X402_NETWORK ?? "eip155:84532",
    x402Price: process.env.X402_PRICE ?? "$0.001",
    x402FacilitatorUrl:
      process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    analysisRpcUrl: optionalEnv(process.env.ANALYSIS_RPC_URL),
    analysisRpcTimeoutMs: Number(process.env.ANALYSIS_RPC_TIMEOUT_MS ?? 3_000),
    simulationMode: optionalSimulationMode(process.env.SIMULATION_MODE),
    anvilRpcUrl: optionalEnv(process.env.ANVIL_RPC_URL),
    simulationTimeoutMs: Number(process.env.SIMULATION_TIMEOUT_MS ?? 10_000),
    groqApiKey: optionalEnv(process.env.GROQ_API_KEY),
    groqModel: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant"
  };
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
