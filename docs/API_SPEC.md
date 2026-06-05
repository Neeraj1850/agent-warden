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
