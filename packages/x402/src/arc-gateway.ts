import {
  CHAIN_CONFIGS,
  GatewayClient,
  type SupportedChainName
} from "@circle-fin/x402-batching/client";
import {
  createGatewayMiddleware,
  type GatewayMiddleware
} from "@circle-fin/x402-batching/server";
import type { GatewayPayer } from "./x402-types.js";

export { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";

export const ARC_TESTNET_NETWORK = "eip155:5042002";
export const ARC_TESTNET_CHAIN = "arcTestnet";
export const GATEWAY_TESTNET_FACILITATOR = "https://gateway-api-testnet.circle.com";

export function getGatewayChainConfig(chain: SupportedChainName = ARC_TESTNET_CHAIN) {
  return CHAIN_CONFIGS[chain];
}

export function createArcGatewaySeller(config: {
  payTo: string;
  networks: string[];
  facilitatorUrl: string;
  description?: string;
}): GatewayMiddleware {
  return createGatewayMiddleware({
    sellerAddress: config.payTo,
    networks: config.networks,
    facilitatorUrl: config.facilitatorUrl,
    description: config.description
  });
}

export function createArcGatewayPayer(config: {
  chain: SupportedChainName;
  privateKey: `0x${string}`;
  rpcUrl?: string;
}): GatewayPayer {
  return new GatewayClient(config);
}
