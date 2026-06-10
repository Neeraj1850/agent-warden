# Arc Integration Plan

## Arc Testnet

Use Arc Testnet for Circle Gateway Nanopayments now, and for separate report anchoring and security-review settlement later.

- RPC URL: `https://rpc.testnet.arc.network`
- Chain ID: `5042002`

## Contracts

- `SecurityReportRegistry`: stores report hash, verdict, risk score, URI, and submitter.
- `PolicyRegistry`: stores enabled policy IDs and metadata URIs.

## Future Standards

- ERC-8004 may identify report submitters later, but identity and reputation must not authorize payment or change deterministic verdicts.
- ERC-8183 is reserved for escrowed security-review jobs with a deliverable and completion settlement.
- Circle Developer-Controlled Wallets are a future signer adapter; Gateway V1 uses a testnet EOA.
- Account abstraction is deferred because Gateway nanopayment verification currently uses `ecrecover`, not EIP-1271 contract signatures.

## Demo Path

The current demo path is an Arc Gateway-paid analysis that returns an unchanged deterministic report. Report anchoring remains a separate later transaction.
