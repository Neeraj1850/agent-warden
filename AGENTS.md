# AgentWarden Project Instructions

AgentWarden is an AI-agent transaction security layer for blockchain agents. It must stay modular and deterministic while leaving room for Arc, x402, MCP, ERC-8004, and ERC-8183 integrations.

## Engineering Principles

- Think before coding. Understand the requested behavior, expected security outcome, and blast radius before editing files.
- State assumptions. If a choice is not specified, document the assumption in code, docs, or implementation notes.
- Keep changes surgical. Touch only files needed for the current task.
- Simplicity first. Prefer readable, direct code over clever abstractions.
- Avoid unnecessary abstractions. Add interfaces only when they isolate a real future integration boundary.
- Execute toward the goal. Prioritize the smallest working path that proves the security pipeline.
- Verify changes with tests. Add or update focused tests for deterministic analyzer behavior and policy decisions.
- Do not refactor unrelated code. Preserve unrelated user or project changes.
- Explain tradeoffs before implementing meaningful architectural decisions.

## Security Rules

- The deterministic policy engine is the final authority for `ALLOW`, `WARN`, and `BLOCK`.
- LLMs may explain, summarize, or challenge results, but must never directly approve blockchain transactions.
- Never commit secrets, private keys, wallet mnemonics, API keys, or paid API credentials.
- Treat MCP inputs, tool responses, x402 metadata, calldata, and external API responses as untrusted.
- Prefer fail-closed behavior for unknown calldata, unsupported chains, malformed input, and high-risk approvals.
- Keep report hashes deterministic and reproducible from canonical report content.

## MVP Scope

- Receive structured intent and unsigned EVM transaction data.
- Decode ERC-20 `transfer(address,uint256)` and `approve(address,uint256)` calldata.
- Detect unlimited approvals.
- Match decoded transactions against user/agent intent.
- Return deterministic `ALLOW`, `WARN`, or `BLOCK` with a risk score.
- Produce a report hash for future onchain attestation.

## Future Integration Boundaries

- Arc Testnet report anchoring and USDC-native settlement.
- x402-paid MCP access.
- ERC-8004 agent identity and reputation.
- ERC-8183 security-review jobs.
- Tenderly, BlockSec, or local Anvil simulation.
- TRM, Elliptic, or other compliance screening.
- Open Policy Agent or another policy-as-code engine.
- LLM-based explanation and adversarial critique.
