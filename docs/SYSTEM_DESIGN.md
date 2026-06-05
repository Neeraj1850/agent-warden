# System Design

## Goal

Provide a security checkpoint that spend-capable AI agents call before signing or broadcasting blockchain transactions.

## Inputs

- structured intent
- unsigned EVM transaction
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
- static asset deltas
- decoded transaction
- policy violations
- static or optional `eth_call` simulation summary
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

Set `ANALYSIS_RPC_URL` to enable optional free RPC `eth_call` success/failure simulation.
