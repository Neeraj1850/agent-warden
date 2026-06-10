# Mock Agent

This example simulates an external AI agent with a wallet address asking AgentWarden to review an unsigned Ethereum Sepolia transaction before signing or broadcasting it.

It uses:

- transaction network: Ethereum Sepolia, chain ID `11155111`
- payment mode: mock x402 header
- endpoint: `POST /analyze`

The mock payment is intentionally local-only. The primary live payment demo uses Circle Gateway Nanopayments on Arc Testnet `eip155:5042002`.

## Run

Start the API in mock payment mode:

```bash
X402_ENABLED=true X402_PROVIDER=mock X402_PAY_TO=0xYourReceivingWallet pnpm --filter @agent-warden/api dev
```

In another terminal, run the safe transfer:

```bash
pnpm --filter @agent-warden/mock-agent safe
```

Run the malicious approval:

```bash
pnpm --filter @agent-warden/mock-agent malicious
```

## Environment

```bash
AGENTWARDEN_API_URL=http://localhost:8787/analyze
MOCK_AGENT_WALLET=0x1111111111111111111111111111111111111111
SEPOLIA_TOKEN_ADDRESS=0x2222222222222222222222222222222222222222
SEPOLIA_RECIPIENT=0x3333333333333333333333333333333333333333
SEPOLIA_SPENDER=0x5555555555555555555555555555555555555555
```

## Expected Output

Safe transfer should return `ALLOW`.

Malicious unlimited approval should return `BLOCK`.
