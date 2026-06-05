# Arc Integration Plan

## Arc Testnet

Use Arc Testnet for report anchoring and future security-review settlement.

- RPC URL: `https://rpc.testnet.arc.network`
- Chain ID: `5042002`

## Contracts

- `SecurityReportRegistry`: stores report hash, verdict, risk score, URI, and submitter.
- `PolicyRegistry`: stores enabled policy IDs and metadata URIs.

## Future Standards

- ERC-8004 for AgentWarden agent identity and reputation.
- ERC-8183 for paid security-review jobs between agents.

## Demo Path

The clean demo path is to analyze a malicious approval, return `BLOCK`, and anchor the resulting report hash on Arc Testnet.
