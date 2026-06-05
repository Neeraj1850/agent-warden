# Contributing

Thanks for helping improve AgentWarden. This project is a security-sensitive AI agent transaction analyzer, so changes should be deterministic, reviewable, and covered by focused tests.

## Setup

Requirements:

- Node.js 20 or newer
- pnpm 10
- Git
- Foundry, only if working in `contracts/`

Install dependencies:

```bash
pnpm install
```

Run checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Useful demos:

```bash
pnpm --filter @agent-warden/attack-payloads local
pnpm --filter @agent-warden/mcp-server demo
```

## Development Guidelines

- Keep the deterministic analyzer as the authority for `ALLOW`, `WARN`, and `BLOCK`.
- Treat calldata, MCP requests, x402 metadata, RPC responses, and tool outputs as untrusted.
- Prefer small, atomic commits with clear messages.
- Add tests when changing policy, decoding, simulation, hashing, API, or MCP behavior.
- Do not add paid APIs or hosted services to the default path.

## Pull Request Checklist

- The change has a focused scope.
- Tests or demo payloads cover the behavior.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass.
- Security-sensitive behavior is documented.
- New dependencies are justified in the PR description.

## Branching

Use short-lived feature branches from `main`, preferably named `feature/<topic>` or `fix/<topic>`. Merge through pull requests with passing CI.
