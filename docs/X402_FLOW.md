# Arc Gateway x402 Flow

## Protected Resources

- `POST /analyze`
- `POST /analyze-signature`

Health, profile, explanation, report retrieval, and report verification routes remain free.

## Request Binding

1. MCP normalizes the analysis request and hashes `{ route, body }`.
2. MCP sends an unpaid request with a random `x-agentwarden-challenge` and `x-agentwarden-request-hash`.
3. The API stores the challenge, route, hash, and five-minute expiry before returning `402`.
4. MCP validates `PAYMENT-REQUIRED` before signing.
5. The paid retry must use the same challenge, route, hash, and body.
6. The API locks the challenge during settlement and consumes it only when payment middleware accepts the retry.
7. Expired, unknown, mismatched, replayed, and concurrently reused challenges fail closed.

The binding is application-level because the EIP-3009 payment authorization does not sign the AgentWarden analysis body.

## Providers

- `X402_PROVIDER=mock`: deterministic local preflight/retry with no funds.
- `X402_PROVIDER=arc-gateway`: Circle Gateway Nanopayments on Arc Testnet.
- `X402_PROVIDER=standard`: standard x402 EVM facilitator compatibility mode.

Legacy `X402_MODE=mock|real` maps to `mock|standard` only if `X402_PROVIDER` is absent.

```bash
X402_ENABLED=true
X402_PROVIDER=arc-gateway
X402_PAY_TO=0xYourReceivingWallet
X402_PRICE=$0.001
X402_ACCEPTED_NETWORKS=eip155:5042002
X402_GATEWAY_FACILITATOR_URL=https://gateway-api-testnet.circle.com
```

USDC and Gateway contract addresses are loaded from Circle `CHAIN_CONFIGS`.

## MCP Modes

- `MCP_ANALYSIS_MODE=local`: direct deterministic analysis.
- `MCP_ANALYSIS_MODE=paid-api`: mandatory HTTP preflight, validation, payment, retry, and report return.

Paid mode validates price, network, USDC asset, payee, exact scheme, and Gateway verifying contract before signing. It never falls back to local analysis.

## Live Arc Test

The live test is opt-in and never deposits funds:

```bash
X402_LIVE_TEST=true pnpm --filter @agent-warden/x402 test:live
```

It requires a testnet EOA key, existing Gateway balance, a running Arc Gateway-protected API, and `X402_LIVE_FROM`, `X402_LIVE_TOKEN`, and `X402_LIVE_RECIPIENT`.
