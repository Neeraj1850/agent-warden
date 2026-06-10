import type { Express, Request, RequestHandler, Response } from "express";
import {
  AGENTWARDEN_CHALLENGE_HEADER,
  AGENTWARDEN_REQUEST_HASH_HEADER,
  ARC_TESTNET_NETWORK,
  CHAIN_CONFIGS,
  InMemoryPaymentChallengeStore,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  createArcGatewaySeller,
  createStandardX402Installer,
  hashBoundRequest,
  parseUsdcPrice,
  type ChallengeFailure,
  type PaymentRequiredPayload,
  type PaymentSettlementMetadata
} from "@agent-warden/x402";
import type { ApiEnv } from "../config/env.js";

const PROTECTED_ROUTES = new Set(["/analyze", "/analyze-signature"]);
const MOCK_PAYMENT_HEADER = "x-agentwarden-mock-payment";
const PAYMENT_LOCK = Symbol("agentwarden-payment-lock");

interface PaymentRequest extends Request {
  payment?: {
    verified: boolean;
    payer: string;
    amount: string;
    network: string;
    transaction?: string;
  };
  [PAYMENT_LOCK]?: {
    challenge: string;
    lockId: string;
    settled: boolean;
  };
}

export interface X402MiddlewareOptions {
  challengeStore?: InMemoryPaymentChallengeStore;
  providerMiddleware?: RequestHandler;
}

export async function installX402Middleware(
  app: Express,
  env: ApiEnv,
  options: X402MiddlewareOptions = {}
): Promise<void> {
  if (!env.x402Enabled) {
    return;
  }

  if (!env.x402PayTo) {
    throw new Error("X402_PAY_TO is required when x402 is enabled");
  }

  const challengeStore =
    options.challengeStore ?? new InMemoryPaymentChallengeStore(env.x402ChallengeTtlMs);
  app.use(createRequestBindingMiddleware(env, challengeStore));

  if (options.providerMiddleware) {
    installProtectedHandler(app, options.providerMiddleware);
  } else if (env.x402Provider === "mock") {
    installProtectedHandler(app, createMockPaymentMiddleware(env));
  } else if (env.x402Provider === "arc-gateway") {
    const gateway = createArcGatewaySeller({
      payTo: env.x402PayTo,
      networks: env.x402AcceptedNetworks,
      facilitatorUrl: env.x402GatewayFacilitatorUrl,
      description: "AgentWarden deterministic security analysis"
    });
    installProtectedHandler(app, gateway.require(env.x402Price) as RequestHandler);
  } else {
    const network = env.x402AcceptedNetworks[0];
    if (!network) {
      throw new Error("X402_ACCEPTED_NETWORKS must include at least one network");
    }
    createStandardX402Installer({
      facilitatorUrl: env.x402StandardFacilitatorUrl,
      network,
      price: env.x402Price,
      payTo: env.x402PayTo,
      routes: protectedRoutes()
    })(app);
  }

  app.use(createSettlementMarker(challengeStore));
  console.log(
    `[x402] provider=${env.x402Provider} routes="/analyze,/analyze-signature" price=${env.x402Price} networks=${env.x402AcceptedNetworks.join(",")}`
  );
}

function createRequestBindingMiddleware(
  env: ApiEnv,
  store: InMemoryPaymentChallengeStore
): RequestHandler {
  return (request: PaymentRequest, response, next) => {
    if (!isProtectedRequest(request)) {
      next();
      return;
    }

    const challenge = singleHeader(request, AGENTWARDEN_CHALLENGE_HEADER);
    const suppliedHash = singleHeader(request, AGENTWARDEN_REQUEST_HASH_HEADER);
    if (!challenge || !suppliedHash) {
      response.status(400).json({
        error: "Missing x402 request binding headers",
        requiredHeaders: [AGENTWARDEN_CHALLENGE_HEADER, AGENTWARDEN_REQUEST_HASH_HEADER]
      });
      return;
    }

    const expectedHash = hashBoundRequest(request.path, request.body);
    if (suppliedHash !== expectedHash) {
      response.status(400).json({
        error: "Request hash does not match route and body"
      });
      return;
    }

    if (!isPaidAttempt(request, env.x402Provider)) {
      const result = store.issue(challenge, expectedHash, request.path);
      if (!result.ok) {
        respondChallengeFailure(response, result.reason);
        return;
      }
      next();
      return;
    }

    const result = store.lock(challenge, expectedHash, request.path);
    if (!result.ok || !result.lockId) {
      respondChallengeFailure(response, result.ok ? "locked" : result.reason);
      return;
    }

    request[PAYMENT_LOCK] = {
      challenge,
      lockId: result.lockId,
      settled: false
    };
    response.once("finish", () => {
      const lock = request[PAYMENT_LOCK];
      if (lock && !lock.settled) {
        store.release(lock.challenge, lock.lockId);
      }
    });
    next();
  };
}

function createSettlementMarker(store: InMemoryPaymentChallengeStore): RequestHandler {
  return (request: PaymentRequest, _response, next) => {
    const lock = request[PAYMENT_LOCK];
    if (lock) {
      lock.settled = store.consume(lock.challenge, lock.lockId);
    }
    next();
  };
}

function createMockPaymentMiddleware(env: ApiEnv): RequestHandler {
  return (request: PaymentRequest, response, next) => {
    const payment = singleHeader(request, MOCK_PAYMENT_HEADER);
    if (payment !== "paid") {
      const requirement = mockPaymentRequirement(request.path, env);
      response
        .status(402)
        .setHeader(
          PAYMENT_REQUIRED_HEADER,
          Buffer.from(JSON.stringify(requirement)).toString("base64")
        )
        .json({ error: "Payment required", provider: "mock" });
      return;
    }

    request.payment = {
      verified: true,
      payer: "0x0000000000000000000000000000000000000001",
      amount: "1000",
      network: env.x402AcceptedNetworks[0] ?? ARC_TESTNET_NETWORK,
      transaction: "mock-transfer"
    };
    const metadata: PaymentSettlementMetadata = {
      provider: "mock",
      payer: request.payment.payer,
      amount: request.payment.amount,
      network: request.payment.network,
      transferId: request.payment.transaction
    };
    response.setHeader(
      PAYMENT_RESPONSE_HEADER,
      Buffer.from(JSON.stringify(metadata)).toString("base64")
    );
    next();
  };
}

function mockPaymentRequirement(path: string, env: ApiEnv): PaymentRequiredPayload {
  const arc = CHAIN_CONFIGS.arcTestnet;
  return {
    x402Version: 2,
    resource: {
      url: path,
      description: "AgentWarden deterministic security analysis",
      mimeType: "application/json"
    },
    accepts: [
      {
        scheme: "exact",
        network: env.x402AcceptedNetworks[0] ?? ARC_TESTNET_NETWORK,
        asset: arc.usdc,
        amount: parseUsdcPrice(env.x402Price).toString(),
        payTo: env.x402PayTo,
        extra: {
          name: "GatewayWalletBatched",
          version: "1",
          verifyingContract: arc.gatewayWallet
        }
      }
    ]
  };
}

function installProtectedHandler(app: Express, handler: RequestHandler): void {
  for (const route of PROTECTED_ROUTES) {
    app.post(route, handler);
  }
}

function protectedRoutes() {
  return [
    {
      method: "POST" as const,
      path: "/analyze",
      description: "AgentWarden transaction security analysis"
    },
    {
      method: "POST" as const,
      path: "/analyze-signature",
      description: "AgentWarden signature security analysis"
    }
  ];
}

function isProtectedRequest(request: Request): boolean {
  return request.method === "POST" && PROTECTED_ROUTES.has(request.path);
}

function isPaidAttempt(request: Request, provider: ApiEnv["x402Provider"]): boolean {
  if (provider === "mock") {
    return Boolean(singleHeader(request, MOCK_PAYMENT_HEADER));
  }
  return Boolean(singleHeader(request, PAYMENT_SIGNATURE_HEADER));
}

function singleHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function respondChallengeFailure(response: Response, reason: ChallengeFailure): void {
  const status = reason === "expired" ? 410 : reason === "locked" ? 409 : 400;
  response.status(status).json({
    error: "Invalid x402 request challenge",
    reason
  });
}
