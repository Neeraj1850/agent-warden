# System Design

## Goal

Provide a security checkpoint that spend-capable AI agents call before signing or broadcasting blockchain transactions.

## Inputs

- structured intent
- unsigned EVM transaction
- signature request payload for typed/off-chain signing analysis
- optional request ID
- future x402 payment proof

## Outputs

- verdict: `ALLOW`, `WARN`, or `BLOCK`
- deterministic risk score
- transaction envelope classification
- normalized action type
- execution graph for root and nested call evidence
- decoded actions
- approval findings
- optional live chain state snapshot
- static asset deltas
- decoded transaction
- policy violations
- static or optional `eth_call` simulation summary
- state-aware findings when RPC state is configured
- safer alternative
- report hash

## Authority Model

The deterministic policy engine decides the final verdict. LLMs may be added as explainers or reviewers, but their output cannot override deterministic policy.

## V1 Analyzer Coverage

AgentWarden V1 analyzes the agent-common EVM transaction surface:

- native transfers
- contract deployments
- ERC-20 transfers and approvals
- ERC-721 transfers, token approvals, and `setApprovalForAll`
- ERC-1155 transfers, batch transfers, and `setApprovalForAll`
- common router swap selectors
- common multicall selectors with static nested selector scans
- execution graph construction for root actions and detected nested actions
- EIP-7702 authorization-list detection
- core-only signature analysis for EIP-712 permit, Permit2-like typed data, `personal_sign`, and blind `eth_sign`
- short-lived signer session memory for approval or permit follow-up sequences
- deterministic local address registries for known routers, known tokens, and risky targets
- optional live state snapshots for balances, target bytecode, allowances, NFT ownership, and operator approvals

Set `ANALYSIS_RPC_URL` to enable optional free RPC `eth_call` success/failure simulation.
The same variable enables state snapshots; set `ANALYSIS_RPC_TIMEOUT_MS` to tune
the per-RPC timeout, default `3000`.

## State-Aware Analysis

The API owns an in-memory session store with a 10-minute default TTL. Recent
approvals, Permit signatures, operator approvals, and unknown selectors are
recorded by signer. A later transaction targeting the same contract is blocked
when it follows a recent approval event.

Local address intelligence contributes policy findings but cannot weaken an
existing deterministic block. The default registry is empty and can be replaced
through the analysis service boundary without changing the analyzer.

When a chain-state provider is configured, AgentWarden snapshots the signer
native balance, nonce, target bytecode, token balances, ERC-20 allowances, and
NFT approvals. State can raise `ALLOW` to `WARN` or `BLOCK`, but it cannot
downgrade existing deterministic policy decisions. RPC failures become
`STATE_LOOKUP_FAILED` findings instead of API crashes.
