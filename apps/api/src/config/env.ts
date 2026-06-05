export interface ApiEnv {
  port: number;
  x402Enabled: boolean;
  x402Mode: "mock" | "real";
  x402PayTo: `0x${string}` | "";
  x402Network: string;
  x402Price: string;
  x402FacilitatorUrl: string;
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
    x402FacilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator"
  };
}
