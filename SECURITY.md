# Security Policy

AgentWarden is a pre-sign transaction analysis layer for AI agents. Please report suspected vulnerabilities privately so users and integrators can be protected before public disclosure.

## Supported Versions

AgentWarden is pre-1.0. Security fixes target `main` until versioned releases begin.

## Reporting A Vulnerability

Email: neerajreddy@websynergies.biz

Please include:

- a concise description of the issue
- affected package, endpoint, MCP tool, policy rule, or transaction type
- reproduction steps or proof-of-concept payload
- expected impact
- any suggested remediation

Do not open a public GitHub issue for exploitable vulnerabilities.

## Response Targets

- Initial acknowledgement: within 72 hours
- Triage update: within 7 days
- Fix plan or disclosure timeline: after impact is confirmed

## Scope

In scope:

- transaction analysis bypasses
- unsafe `ALLOW` verdicts for malicious calldata
- MCP tool input validation issues
- x402 payment-gating bypasses when enabled
- report hash integrity bugs
- secrets exposure or unsafe logging

Out of scope:

- denial-of-service against local demo commands
- vulnerabilities in third-party chains, wallets, RPC providers, or package registries
- issues requiring compromised developer machines or leaked private keys

## Safe Harbor

Good-faith research that avoids data theft, fund movement, service disruption, and public disclosure before remediation will be treated as authorized security research.
