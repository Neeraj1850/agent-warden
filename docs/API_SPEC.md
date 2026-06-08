# API Spec

Machine-readable OpenAPI 3.1 contract: [`docs/openapi.yaml`](./openapi.yaml).

## `GET /health`

Returns service status.

## `POST /analyze`

Analyzes an unsigned EVM transaction.

### Request

```json
{
  "requestId": "demo-1",
  "profileId": "payment",
  "intent": {
    "action": "transfer",
    "chainId": 5042002,
    "from": "0x1111111111111111111111111111111111111111",
    "tokenAddress": "0x2222222222222222222222222222222222222222",
    "recipient": "0x3333333333333333333333333333333333333333",
    "amount": "1000000",
    "expectedOutcome": {
      "recipients": ["0x3333333333333333333333333333333333333333"],
      "tokenOutflows": [
        {
          "assetStandard": "erc20",
          "tokenAddress": "0x2222222222222222222222222222222222222222",
          "recipient": "0x3333333333333333333333333333333333333333",
          "amount": "1000000"
        }
      ],
      "allowUnknownLogs": false
    }
  },
  "transaction": {
    "chainId": 5042002,
    "from": "0x1111111111111111111111111111111111111111",
    "to": "0x2222222222222222222222222222222222222222",
    "data": "0xa9059cbb..."
  }
}
```

`profileId` is optional. If omitted, AgentWarden uses the default balanced
profile. A request may also include an inline `policyProfile` object for
agent-specific guardrails such as allowed chains, actions, recipients, tokens,
spenders, operators, routers, value limits, required simulation, and required
expected outcomes.

### Response

Returns a `SecurityReport` with verdict, risk score, decoded transaction, policy violations, simulation summary, safer alternative, and report hash.

The V1 response also includes:

- `transactionEnvelope`
- `actionType`
- `riskVector`
- `executionGraph`
- `decodedActions`
- `assetDeltas`
- `approvalFindings`
- `stateSnapshot` when chain state is configured or injected
- `stateFindings` when chain state contributes findings
- `benchmarkProfile`
- `simulationResult.revertReason` when an RPC simulation fails

The API also applies short-lived signer session checks and configured local
address-intelligence findings before producing the final verdict and report
hash.

Set `ANALYSIS_RPC_URL` to enable live EVM state snapshots through the default
ethers-backed JSON-RPC provider. Optional `ANALYSIS_RPC_TIMEOUT_MS` defaults to
`3000`. Alchemy SDK is not required for the current exact pre-sign reads.
Simulation defaults to `eth_call` when `ANALYSIS_RPC_URL` exists and `static`
otherwise. Set `SIMULATION_MODE=anvil` and `ANVIL_RPC_URL` to use an external
Anvil fork for execution evidence.

`intent.expectedOutcome` is optional. When present, simulation evidence is
checked against declared recipients, token/NFT outflows, approvals, spenders,
operators, native/token limits, and unknown-log policy before the deterministic
verdict is finalized.

Built-in V1 profiles include `default`, `strict-treasury`,
`testnet-developer`, `payment`, and `trading`.

## `POST /analyze-signature`

Analyzes an off-chain signature request such as EIP-712 typed data,
`personal_sign`, or `eth_sign`.

### Request

```json
{
  "requestId": "sig-1",
  "intent": {
    "action": "permit",
    "chainId": 5042002,
    "from": "0x1111111111111111111111111111111111111111",
    "verifyingContract": "0x2222222222222222222222222222222222222222",
    "spender": "0x3333333333333333333333333333333333333333",
    "maxAmount": "1000000"
  },
  "payload": {
    "kind": "eip712_typed_data",
    "typedData": {
      "domain": {
        "name": "TestToken",
        "chainId": 5042002,
        "verifyingContract": "0x2222222222222222222222222222222222222222"
      },
      "primaryType": "Permit",
      "message": {
        "owner": "0x1111111111111111111111111111111111111111",
        "spender": "0x3333333333333333333333333333333333333333",
        "value": "1000000",
        "deadline": "9999999999"
      }
    }
  }
}
```

### Response

Returns a `SignatureSecurityReport` with verdict, risk score, decoded signature,
policy violations, safer alternative, and report hash.

## `POST /explain-report`

Explains an existing transaction `SecurityReport`. The explanation is
non-authoritative and cannot change the deterministic verdict, risk score, or
report hash.

### Request

```json
{
  "report": {
    "verdict": "BLOCK",
    "riskScore": 95,
    "reportHash": "0x..."
  }
}
```

### Response

Returns `verdict`, `riskScore`, `reportHash`, `model`, `explanation`, and a
`safetyNotice`. If `GROQ_API_KEY` is unset or the Groq call fails, AgentWarden
returns a safe deterministic fallback explanation.
