# Threat Model

## Main Threats

- prompt injection causing an agent to sign malicious transactions
- malicious ERC-20 approvals or Permit-style allowance drains
- transaction calldata that hides dangerous behavior
- mismatch between declared intent and actual transaction fields
- replayed or mismatched x402 payment proofs
- malicious MCP tools or poisoned tool descriptions
- simulation result manipulation from untrusted providers

## MVP Mitigations

- explicit structured intent
- calldata decoding for ERC-20 transfer and approve
- deterministic policy checks
- report hashing
- no LLM authority
- x402 route/body hash binding with expiring single-use challenges
- payment requirement validation before signing
- no trust in payment metadata or facilitator responses

## Future Mitigations

- full ABI-aware decoding
- fork simulation
- MEV and slippage analysis
- compliance screening
- MCP server allowlists
- Arc attestation and reputation
