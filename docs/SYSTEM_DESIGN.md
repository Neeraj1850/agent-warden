# System Design

## Goal

Provide a security checkpoint that spend-capable AI agents call before signing or broadcasting blockchain transactions.

## Inputs

- structured intent
- unsigned EVM transaction
- signature request payload for typed/off-chain signing analysis
- optional request ID
- optional x402 challenge, canonical request hash, and verified settlement metadata

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
- observed outcome mismatches when simulation evidence is available
- optional agent policy profile findings
- state-aware findings when RPC state is configured
- safer alternative
- report hash
- optional local report persistence and verification result

## Authority Model

The deterministic policy engine decides the final verdict. LLMs may be added as explainers or reviewers, but their output cannot override deterministic policy.
The `/explain-report` API and `explain_report` MCP tool accept completed
transaction reports only, preserve verdict/risk/hash fields, and fall back to a
deterministic safe explanation when Groq is unavailable.

Report verification is also deterministic. `/verify-report` and the
`verify_report` MCP tool recompute the report hash from the completed report and
the original request context without RPC, LLMs, MCP metadata, or wall-clock
state.

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

Simulation is selected through `SIMULATION_MODE=static|eth_call|anvil`.
`eth_call` uses `ANALYSIS_RPC_URL`; Anvil uses an externally started fork at
`ANVIL_RPC_URL`. AgentWarden does not install or manage Foundry processes.
`SIMULATION_TIMEOUT_MS` defaults to `10000`.
`ANALYSIS_RPC_URL` also enables state snapshots through `EthersChainStateProvider`;
set `ANALYSIS_RPC_TIMEOUT_MS` to tune the state-read timeout, default `3000`.
`ViemChainStateProvider` remains available, while viem continues to be used for
ABI and calldata decoding.

Simulation evidence can raise verdicts but never downgrade them. Confirmed
reverts, simulation chain mismatch, unexpected simulated outflows, unexpected
simulated approvals, and fork restore failures become deterministic policy
violations.

When agents provide `intent.expectedOutcome`, AgentWarden compares simulated
asset deltas, approval events, recipients, NFT transfers, token limits, native
value limits, and unknown logs against that declared outcome. The deterministic
pipeline is:

`intent -> decode -> state snapshot -> simulation -> observed outcome comparison -> verdict`

Outcome mismatches such as `UNEXPECTED_RECIPIENT`,
`UNEXPECTED_TOKEN_OUTFLOW`, `UNEXPECTED_NFT_TRANSFER`,
`APPROVAL_NOT_IN_INTENT`, `UNEXPECTED_LOG_EVENT`, and
`OUTCOME_EXCEEDS_INTENT` raise the final verdict without weakening any earlier
policy decision.

## Audit Trail

When `REPORT_STORE_DIR` is configured, the API persists completed transaction
and signature reports as local JSON files named `<reportHash>.json`.
`GET /reports/:reportHash` retrieves the stored report, and `POST
/verify-report` recomputes the expected hash from the original request context.

This local store is intentionally simple: no database, no external services, and
no mutation of report verdicts. Persistence errors return an API error only
after analysis has completed, making storage failures visible instead of
silently losing audit evidence.

The audit trail creates the bridge toward future anchoring: first prove report
reproducibility locally, then anchor only the deterministic report hash and any
required metadata in a later module.

## Agent Policy Profiles

Requests may provide `profileId` or an inline `policyProfile`. If neither is
present, AgentWarden uses the default balanced profile and preserves existing
behavior.

Policy profiles are deterministic guardrails for agent/app/wallet classes. V1
ships a local registry with `default`, `strict-treasury`, `testnet-developer`,
`payment`, and `trading`. Profiles can constrain chains, intent actions,
recipients, tokens, spenders, operators, routers, native/token limits,
approvals, operator approvals, deployments, unknown contract calls, simulation
requirements, and explicit expected-outcome requirements.

Profile checks run after decode and simulation evidence are available:

`intent -> decode -> profile selection -> state snapshot -> simulation -> observed outcome comparison -> profile policy -> verdict`

Profile findings can raise `ALLOW` to `WARN` or `BLOCK`, but cannot downgrade
an existing deterministic block.

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

Alchemy-style enriched intelligence is intentionally deferred. It can later add
metadata, spam NFT, portfolio, and transfer-history signals, but exact live
pre-sign checks stay portable through standard EVM JSON-RPC reads.
