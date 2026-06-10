# MCP Spec

## Tool: `analyze_transaction`

Accepts the same payload as `POST /analyze`.

## Tool: `analyze_signature`

Accepts the same payload as `POST /analyze-signature`.

## Tool: `verify_report`

Accepts a completed transaction or signature report plus its original request
context and recomputes the deterministic report hash.

## Tool: `get_report`

Retrieves a locally persisted report by hash when `REPORT_STORE_DIR` is
configured for the MCP server process.

## Behavior

- validates structured intent and unsigned transaction data
- delegates to the deterministic core analyzer
- analyzes EIP-712, `personal_sign`, and `eth_sign` payloads through the signature tool
- verifies completed reports without RPC, LLM, or wall-clock inputs
- retrieves locally persisted report JSON without changing verdict fields
- returns the full security report, including summary, findings, recommended action, and report hash
- marks the MCP tool result as `isError: true` when the verdict is `BLOCK`
- logs verdict, risk score, and report hash to stderr for local demo tracing

## Current Transport

The MCP server now uses the official TypeScript SDK over stdio:

```bash
pnpm --filter @agent-warden/mcp-server dev
```

You can inspect the registered tool shape with:

```bash
pnpm --filter @agent-warden/mcp-server dev -- --describe
```

## Local Client Demo

Run the stdio client demo:

```bash
pnpm --filter @agent-warden/mcp-server demo
```

The client:

- spawns the local MCP server over stdio
- calls `tools/list` and confirms `analyze_transaction` is registered
- sends a safe ERC-20 transfer and expects `ALLOW`
- sends an unlimited ERC-20 approval and expects `BLOCK`
- verifies the safe report through `verify_report`
- prints summary, recommended action, risk score, action type, and report hash

## Additional Tools

- `decode_calldata`: decodes unsigned EVM transaction calldata without policy or scoring.
- `analyze_signature`: analyzes typed/off-chain signature requests before signing.
- `get_policy`: returns the active deterministic policy flags.
- `list_policy_profiles`: lists built-in deterministic policy profiles.
- `get_policy_profile`: retrieves one built-in policy profile.
- `check_address`: validates one EVM address and optionally calls GoPlus when `GOPLUS_ENABLED=true`.
- `explain_report`: explains a completed report without changing deterministic fields.
- `verify_report`: recomputes a report hash from the original request context.
- `get_report`: reads a persisted report from `REPORT_STORE_DIR`.

## x402 Paid Bridge

MCP supports two explicit analysis modes:

- `local`: transaction and signature tools call the deterministic analyzer directly.
- `paid-api`: tools call the protected HTTP API through Circle Gateway Nanopayments.

Paid mode performs an unpaid preflight, validates the complete payment requirement against configured limits and Circle chain configuration, and only then signs. It never silently falls back to core. Successful tool results include bounded payment metadata in MCP `_meta`; private keys, signatures, and raw authorizations are never returned.

The deterministic report JSON is unchanged between local and paid modes.
