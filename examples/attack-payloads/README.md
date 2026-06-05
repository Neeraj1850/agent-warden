# Attack Payloads

This package runs a reproducible suite of unsigned EVM transaction payloads through AgentWarden.

It demonstrates common agent signing risks:

- safe ERC-20 transfer
- unlimited ERC-20 approval
- ERC-721 collection-wide operator approval
- ERC-1155 collection-wide operator approval
- suspicious multicall with hidden approval
- EIP-7702 authorization-list transaction
- EIP-2612/Permit2-style approval bypass
- EIP-4337 account abstraction bundle
- native value hidden in a contract call
- unknown selector
- contract deployment
- known swap selector

## Local Analyzer Mode

Runs directly against `@agent-warden/core` without starting the API.

```bash
pnpm --filter @agent-warden/attack-payloads local
```

This also writes reproducible demo artifacts:

- `examples/attack-payloads/results/demo-report.md`
- `examples/attack-payloads/results/demo-report.json`

Use `pnpm --filter @agent-warden/attack-payloads local -- --no-artifacts` to skip artifact generation.

## API Mode

Start the API with x402 disabled:

```bash
$env:X402_ENABLED="false"
pnpm --filter @agent-warden/api dev
```

Run the payload suite:

```bash
pnpm --filter @agent-warden/attack-payloads api
```

API mode writes the same artifacts, but the reports come from the running `POST /analyze` service.

Override the API URL:

```bash
$env:AGENTWARDEN_API_URL="http://localhost:8787/analyze"
pnpm --filter @agent-warden/attack-payloads api
```
