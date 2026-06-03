# ArcWarden

ArcWarden is an AI-agent transaction security layer for blockchain agents. It exposes an x402-paid MCP security agent that other agents can call before signing or broadcasting an unsigned EVM transaction.

The MVP is intentionally deterministic. It receives structured intent plus unsigned transaction data, decodes common ERC-20 calldata, applies policy checks, and returns a signed-analysis style report:

- `ALLOW`, `WARN`, or `BLOCK`
- deterministic risk score
- decoded transaction
- policy violations
- simulation result placeholder
- safer alternative
- report hash for future onchain attestation

LLMs may explain results later, but the deterministic policy engine is always the final authority.

## Transaction Analysis V1

ArcWarden now focuses first on pre-sign EVM transaction analysis. The analyzer classifies transaction envelopes, decodes agent-common actions, checks intent alignment, finds risky approvals, computes static asset deltas, and can optionally run `eth_call` simulation when `ANALYSIS_RPC_URL` is configured.

V1 coverage:

- native transfers and contract deployments
- ERC-20 transfers, `transferFrom`, and approvals
- ERC-721 transfers, token approvals, and `setApprovalForAll`
- ERC-1155 transfers, batch transfers, and `setApprovalForAll`
- common swap and multicall selectors
- EIP-7702 authorization-list detection

x402 remains parked and disabled by default while the analyzer core matures.

## How The Flow Works

1. An agent prepares an unsigned EVM transaction and structured intent.
2. The agent calls ArcWarden through the API or MCP tool.
3. ArcWarden decodes calldata and validates the request.
4. The policy engine checks chain, sender, token, recipient or spender, amount, unknown selectors, and unlimited approvals.
5. The analyzer returns a deterministic verdict and report hash.
6. Future versions will require x402 payment before analysis and anchor report hashes on Arc Testnet.

## Local Development

This repository uses pnpm workspaces.

```bash
pnpm install
pnpm test
pnpm lint
pnpm dev
```

The current MVP does not require paid APIs or external services.

## Mock Agent Flow

The mock agent simulates an AI agent with a wallet address preparing an unsigned Ethereum Sepolia transaction.

Start ArcWarden with mock x402 enabled:

```bash
X402_ENABLED=true X402_MODE=mock pnpm --filter @arc-warden/api dev
```

Run a safe transfer request:

```bash
pnpm --filter @arc-warden/mock-agent safe
```

Run a malicious unlimited approval request:

```bash
pnpm --filter @arc-warden/mock-agent malicious
```

This uses Ethereum Sepolia for the transaction being analyzed and a local mock x402 payment header for the API gate. Real public x402 testnet payments should use Base Sepolia `eip155:84532`.

## MCP Tool

The MCP server package contains an `analyze_transaction` tool wrapper around the core analyzer. The first implementation is kept SDK-light so the deterministic core can be tested locally before wiring a full MCP transport.

Future integration will add the official MCP SDK transport and expose the tool over stdio or HTTP.

## x402 Integration Plan

The API now supports an x402-protected `/analyze` path through Express middleware.

Local mock mode:

```bash
X402_ENABLED=true X402_MODE=mock pnpm --filter @arc-warden/api dev
```

Real Base Sepolia mode:

```bash
X402_ENABLED=true \
X402_MODE=real \
X402_PAY_TO=0xYourReceivingWallet \
X402_PRICE=$0.001 \
X402_NETWORK=eip155:84532 \
pnpm --filter @arc-warden/api dev
```

The first grant demo should:

- protect analysis requests with x402
- require a max payment cap
- bind payment metadata to the analysis request hash
- reject replayed or mismatched payments
- keep paid endpoint responses untrusted

## Arc Integration Plan

The `packages/arc` package and `contracts` folder contain placeholders for:

- Arc Testnet client setup
- report hash anchoring
- ERC-8004 agent identity
- ERC-8183 security-review jobs
- policy registry governance

Arc is the target settlement and attestation environment for the grant-facing roadmap.
