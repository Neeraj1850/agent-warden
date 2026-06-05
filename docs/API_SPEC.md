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
  "intent": {
    "action": "transfer",
    "chainId": 5042002,
    "from": "0x1111111111111111111111111111111111111111",
    "tokenAddress": "0x2222222222222222222222222222222222222222",
    "recipient": "0x3333333333333333333333333333333333333333",
    "amount": "1000000"
  },
  "transaction": {
    "chainId": 5042002,
    "from": "0x1111111111111111111111111111111111111111",
    "to": "0x2222222222222222222222222222222222222222",
    "data": "0xa9059cbb..."
  }
}
```

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
- `benchmarkProfile`
- `simulationResult.revertReason` when an RPC simulation fails
