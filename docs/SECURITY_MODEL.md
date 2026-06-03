# Security Model

ArcWarden assumes all external inputs are untrusted, including MCP requests, tool outputs, x402 metadata, calldata, and future simulation responses.

## MVP Controls

- fail closed on unsupported calldata
- block chain mismatch
- block sender mismatch
- block token mismatch
- block recipient or spender mismatch
- block unknown selectors
- block unlimited approvals by default
- block collection-wide ERC-721/ERC-1155 operator approvals by default
- block EIP-7702 authorization-list transactions by default
- flag suspicious multicalls with nested approvals or swaps
- produce deterministic report hashes

## LLM Boundary

LLMs must not receive private keys or signing authority. LLM output can explain a report, suggest safer alternatives, or flag uncertainty, but cannot approve a transaction.
