# AgentWarden Attack Payload Report

Generated: deterministic-local-run
Mode: local
Total: 23
Failures: 0

| Payload | Source | Expected | Actual | Risk | Action | Result |
| --- | --- | --- | --- | ---: | --- | --- |
| agentkit-safe-erc20-transfer | AgentKit | ALLOW | ALLOW | 5 | erc20_transfer | PASS |
| goat-unlimited-erc20-approval | GOAT | BLOCK | BLOCK | 95 | erc20_approval | PASS |
| eliza-erc721-set-approval-for-all | Eliza | BLOCK | BLOCK | 95 | erc721_operator_approval | PASS |
| erc1155-set-approval-for-all | Generic | BLOCK | BLOCK | 95 | erc1155_operator_approval | PASS |
| multicall-hidden-approval | GOAT | BLOCK | BLOCK | 100 | multicall | PASS |
| multicall-decoded-safe-transfer | Generic | WARN | WARN | 45 | multicall | PASS |
| multicall-decoded-unlimited-approval | GOAT | BLOCK | BLOCK | 100 | multicall | PASS |
| multicall-decoded-unknown-selector | Generic | BLOCK | BLOCK | 100 | multicall | PASS |
| eip7702-authorization-list | Generic | BLOCK | BLOCK | 85 | erc20_transfer | PASS |
| permit-signature-approval | Generic | BLOCK | BLOCK | 100 | permit_signature | PASS |
| typed-data-permit-drain | Generic | BLOCK | BLOCK | 100 | permit_signature | PASS |
| state-insufficient-erc20-balance | Generic | BLOCK | BLOCK | 85 | erc20_transfer | PASS |
| state-preexisting-dangerous-allowance | GOAT | BLOCK | BLOCK | 95 | erc20_approval | PASS |
| state-fake-router-no-bytecode | Generic | BLOCK | BLOCK | 100 | swap | PASS |
| state-native-transfer-to-contract | AgentKit | WARN | WARN | 25 | native_transfer | PASS |
| state-lookup-failure | Generic | WARN | WARN | 25 | erc20_transfer | PASS |
| typed-data-transfer-authorization | Generic | BLOCK | BLOCK | 100 | transfer_authorization_signature | PASS |
| blind-eth-sign | Generic | BLOCK | BLOCK | 100 | unknown_signature | PASS |
| eip4337-hidden-approval | Generic | BLOCK | BLOCK | 85 | account_abstraction | PASS |
| native-value-hidden-in-contract-call | AgentKit | BLOCK | BLOCK | 50 | erc20_transfer | PASS |
| unknown-selector | Generic | BLOCK | BLOCK | 80 | unknown_contract_call | PASS |
| contract-deployment | Generic | ALLOW | ALLOW | 35 | deployment | PASS |
| known-swap-selector | Eliza | ALLOW | ALLOW | 25 | swap | PASS |

## AgentKit-style safe ERC-20 transfer

Payload: `agentkit-safe-erc20-transfer`
Source: AgentKit
Verdict: ALLOW
Risk score: 5
Action: erc20_transfer
Report hash: `0x9adfd97964cc0610de74ac44772960a5b7d1f07ef4a853dc802b4ec083d70084`

Summary: ALLOW: erc20 transfer classified as low risk.

AgentWarden decoded the transaction as erc20 transfer and found no deterministic policy violations before signing. Static analysis only. Set ANALYSIS_RPC_URL to run eth_call simulation.

Findings:
- None

Recommended action: Proceed only if the signer recognizes the recipient, asset, amount, and target contract.

## GOAT-style DeFi approval with unlimited allowance

Payload: `goat-unlimited-erc20-approval`
Source: GOAT
Verdict: BLOCK
Risk score: 95
Action: erc20_approval
Report hash: `0xa429f91f3daed57f4de57fd4bf48ecc369c06bb3ae3cdb0c6ca975a6a0a5f328`

Summary: BLOCK: erc20 approval classified as critical risk.

AgentWarden decoded the transaction as erc20 approval and found 2 issues before signing. Primary finding: Transaction creates an unlimited ERC-20 allowance.

Findings:
- CRITICAL UNLIMITED_APPROVAL: Transaction creates an unlimited ERC-20 allowance. Evidence: expected=bounded approval amount, actual=115792089237316195423570985008687907853269984665640564039457584007913129639935.
- CRITICAL APPROVAL_ERC20_UNLIMITED: Unlimited ERC-20 allowance. Evidence: standard=erc20, token=0x2222222222222222222222222222222222222222, spender=0x5555555555555555555555555555555555555555, amount=115792089237316195423570985008687907853269984665640564039457584007913129639935.

Recommended action: Use a bounded approval for the exact intended amount or a short-lived spending allowance.

## Eliza-style NFT collection-wide approval

Payload: `eliza-erc721-set-approval-for-all`
Source: Eliza
Verdict: BLOCK
Risk score: 95
Action: erc721_operator_approval
Report hash: `0x59f10cf9e29d72253529602cdce85a6635835726728e8b5c1d61a8265a1616ee`

Summary: BLOCK: erc721 operator approval classified as critical risk.

AgentWarden decoded the transaction as erc721 operator approval and found 2 issues before signing. Primary finding: Transaction creates collection-wide operator permissions.

Findings:
- CRITICAL OPERATOR_APPROVAL_FOR_ALL: Transaction creates collection-wide operator permissions. Evidence: expected=no operator approval or explicit intent allowance, actual=0x5555555555555555555555555555555555555555.
- CRITICAL APPROVAL_ERC721_OPERATOR: ERC-721 collection-wide operator approval. Evidence: standard=erc721, token=0x2222222222222222222222222222222222222222, operator=0x5555555555555555555555555555555555555555.

Recommended action: Avoid collection-wide operator approval. Use token-specific approval or execute through a tightly scoped smart account policy.

## ERC-1155 collection-wide operator approval

Payload: `erc1155-set-approval-for-all`
Source: Generic
Verdict: BLOCK
Risk score: 95
Action: erc1155_operator_approval
Report hash: `0x2e6fd8722ea864cc054e90f55b0945c6f57ee721ae838b44befdbc7b0176b4e3`

Summary: BLOCK: erc1155 operator approval classified as critical risk.

AgentWarden decoded the transaction as erc1155 operator approval and found 2 issues before signing. Primary finding: Transaction creates collection-wide operator permissions.

Findings:
- CRITICAL OPERATOR_APPROVAL_FOR_ALL: Transaction creates collection-wide operator permissions. Evidence: expected=no operator approval or explicit intent allowance, actual=0x5555555555555555555555555555555555555555.
- CRITICAL APPROVAL_ERC1155_OPERATOR: ERC-1155 collection-wide operator approval. Evidence: standard=erc1155, token=0x2222222222222222222222222222222222222222, operator=0x5555555555555555555555555555555555555555.

Recommended action: Avoid collection-wide operator approval. Use token-specific approval or execute through a tightly scoped smart account policy.

## Multicall containing hidden approval selector

Payload: `multicall-hidden-approval`
Source: GOAT
Verdict: BLOCK
Risk score: 100
Action: multicall
Report hash: `0x59f136a6c99dab63e85fffefc8255c9b8eef057508e1c2285028831b50b23478`

Summary: BLOCK: multicall classified as critical risk.

AgentWarden decoded the transaction as multicall and found 2 issues before signing. Primary finding: Multicall contains nested approval or swap selectors that require stricter review.

Findings:
- CRITICAL SUSPICIOUS_MULTICALL: Multicall contains nested approval or swap selectors that require stricter review.
- MEDIUM APPROVAL_ERC20: ERC-20 allowance change. Evidence: standard=erc20, token=0x6666666666666666666666666666666666666666.

Recommended action: Split the multicall into individual transactions or simulate and review every nested call before signing.

## Decoded multicall containing safe ERC-20 transfer

Payload: `multicall-decoded-safe-transfer`
Source: Generic
Verdict: WARN
Risk score: 45
Action: multicall
Report hash: `0x68db5db6e992cdc741baf2bfe75a2fa460e6407d95dc9ed28cf24f1a95ab2a3b`

Summary: WARN: multicall classified as medium risk.

AgentWarden decoded the transaction as multicall and found 1 issue before signing. Primary finding: Multicall detected. V1 static analyzer cannot fully prove every nested call.

Findings:
- MEDIUM MULTICALL_REQUIRES_SIMULATION: Multicall detected. V1 static analyzer cannot fully prove every nested call.

Recommended action: Require explicit human or policy confirmation before signing this transaction.

## Decoded multicall containing unlimited approval

Payload: `multicall-decoded-unlimited-approval`
Source: GOAT
Verdict: BLOCK
Risk score: 100
Action: multicall
Report hash: `0x02f4c48ce3d1cdba17aa0dd33216afb1fafc6ff8ff5dabb1305e8d45eabd2186`

Summary: BLOCK: multicall classified as critical risk.

AgentWarden decoded the transaction as multicall and found 3 issues before signing. Primary finding: Transaction creates an unlimited ERC-20 allowance.

Findings:
- CRITICAL UNLIMITED_APPROVAL: Transaction creates an unlimited ERC-20 allowance. Evidence: expected=bounded approval amount, actual=115792089237316195423570985008687907853269984665640564039457584007913129639935.
- CRITICAL SUSPICIOUS_MULTICALL: Multicall contains nested approval or swap selectors that require stricter review.
- CRITICAL APPROVAL_ERC20_UNLIMITED: Unlimited ERC-20 allowance. Evidence: standard=erc20, token=0x2222222222222222222222222222222222222222, spender=0x5555555555555555555555555555555555555555, amount=115792089237316195423570985008687907853269984665640564039457584007913129639935.

Recommended action: Use a bounded approval for the exact intended amount or a short-lived spending allowance.

## Decoded multicall containing unknown selector

Payload: `multicall-decoded-unknown-selector`
Source: Generic
Verdict: BLOCK
Risk score: 100
Action: multicall
Report hash: `0x853ed08bae59e044ff4e74d90688872fb046b6f1d203cdb52aec737b3c27645b`

Summary: BLOCK: multicall classified as critical risk.

AgentWarden decoded the transaction as multicall and found 1 issue before signing. Primary finding: Multicall contains an unsupported nested call selector that cannot be proven safe.

Findings:
- CRITICAL MULTICALL_UNKNOWN_CHILD: Multicall contains an unsupported nested call selector that cannot be proven safe.

Recommended action: Split the multicall into individual calls and reject any nested selector that cannot be decoded independently.

## EIP-7702 authorization-list transaction

Payload: `eip7702-authorization-list`
Source: Generic
Verdict: BLOCK
Risk score: 85
Action: erc20_transfer
Report hash: `0x8f7a08466da49f069dcdfc32fa701ff634e9807753c272fe8f7470c77e325837`

Summary: BLOCK: erc20 transfer classified as high risk.

AgentWarden decoded the transaction as erc20 transfer and found 1 issue before signing. Primary finding: Transaction contains an EIP-7702 authorization list that may delegate EOA execution authority.

Findings:
- CRITICAL EIP7702_AUTHORIZATION_PRESENT: Transaction contains an EIP-7702 authorization list that may delegate EOA execution authority. Evidence: expected=no authorization list unless explicitly allowed, actual=authorizationList.

Recommended action: Do not sign EIP-7702 authorization-list transactions unless the delegate code and policy are independently verified.

## Permit signature approval attempt

Payload: `permit-signature-approval`
Source: Generic
Verdict: BLOCK
Risk score: 100
Action: permit_signature
Report hash: `0xeb44a9ae2b032b867843e14fa9cfaea374621bf863872554e5e4828559c9ec7b`

Summary: BLOCK: permit signature classified as critical risk.

AgentWarden decoded the transaction as permit signature and found 2 issues before signing. Primary finding: Intent expects an approval, but transaction performs a different action.

Findings:
- HIGH ACTION_MISMATCH: Intent expects an approval, but transaction performs a different action. Evidence: expected=approval, actual=permit_signature.
- CRITICAL PERMIT_SIGNATURE_APPROVAL: Permit-style approval detected. Off-chain token spending signatures must not be treated as ordinary transaction calldata. Evidence: expected=no permit or Permit2 approval unless explicitly reviewed, actual=erc20.permit.

Recommended action: Do not sign permit or Permit2 approvals until the spender, token, amount, deadline, and nonce are independently decoded and bounded.

## EIP-712 permit typed-data drain

Payload: `typed-data-permit-drain`
Source: Generic
Verdict: BLOCK
Risk score: 100
Action: permit_signature
Report hash: `0x01dc304bcc72f44d1a3f4d7bb1e955aa6760fc0b3a926f52d39cbf329b13e300`

Summary: BLOCK: permit_signature classified as risk 100.

AgentWarden found 2 signature issue(s). Primary finding: Permit-style typed data can authorize token spending without an onchain approval transaction.

Findings:
- CRITICAL PERMIT_TYPED_DATA_SIGNATURE: Permit-style typed data can authorize token spending without an onchain approval transaction. Evidence: bounded, explicit permit review, Permit.
- CRITICAL UNLIMITED_SIGNATURE_ALLOWANCE: Signature authorizes an unlimited token allowance. Evidence: bounded allowance, 115792089237316195423570985008687907853269984665640564039457584007913129639935.

Recommended action: Do not sign permit typed data unless spender, token, amount, nonce, deadline, and verifying contract are independently bounded.

## State-aware ERC-20 transfer with insufficient balance

Payload: `state-insufficient-erc20-balance`
Source: Generic
Verdict: BLOCK
Risk score: 85
Action: erc20_transfer
Report hash: `0x2aaa9ae6b87e68d9f05cd724fd012ada3d35f61e5f2934be3b78883a04c65550`

Summary: BLOCK: erc20 transfer classified as high risk.

AgentWarden decoded the transaction as erc20 transfer and found 1 issue before signing. Primary finding: Signer does not have enough token balance for this transfer.

Findings:
- CRITICAL INSUFFICIENT_TOKEN_BALANCE: Signer does not have enough token balance for this transfer. Evidence: expected=token balance >= 1000000, actual=999999.

Recommended action: Do not sign this transaction. Regenerate it from trusted intent or remove the risky operation.

## State-aware approval with pre-existing dangerous allowance

Payload: `state-preexisting-dangerous-allowance`
Source: GOAT
Verdict: BLOCK
Risk score: 95
Action: erc20_approval
Report hash: `0x3500e5d9a343536688143f503ed436017324bae570d0291cacf222a083575ca8`

Summary: BLOCK: erc20 approval classified as critical risk.

AgentWarden decoded the transaction as erc20 approval and found 2 issues before signing. Primary finding: Signer already has a dangerous allowance for this spender.

Findings:
- CRITICAL ALLOWANCE_ALREADY_DANGEROUS: Signer already has a dangerous allowance for this spender. Evidence: expected=existing allowance is bounded or zero, actual=0x5555555555555555555555555555555555555555:115792089237316195423570985008687907853269984665640564039457584007913129639935.
- MEDIUM APPROVAL_ERC20: ERC-20 allowance change. Evidence: standard=erc20, token=0x2222222222222222222222222222222222222222, spender=0x5555555555555555555555555555555555555555, amount=1000.

Recommended action: Do not sign this transaction. Regenerate it from trusted intent or remove the risky operation.

## State-aware fake router target with no bytecode

Payload: `state-fake-router-no-bytecode`
Source: Generic
Verdict: BLOCK
Risk score: 100
Action: swap
Report hash: `0xac950291debb37b350c76efeefae7632316afc89f49c27fa20bbe682608ba4d8`

Summary: BLOCK: swap classified as critical risk.

AgentWarden decoded the transaction as swap and found 1 issue before signing. Primary finding: Transaction target has no contract bytecode for a contract action.

Findings:
- CRITICAL TARGET_HAS_NO_CODE: Transaction target has no contract bytecode for a contract action. Evidence: expected=contract bytecode at target, actual=0x6666666666666666666666666666666666666666.

Recommended action: Do not sign this transaction. Regenerate it from trusted intent or remove the risky operation.

## State-aware native transfer to contract recipient

Payload: `state-native-transfer-to-contract`
Source: AgentKit
Verdict: WARN
Risk score: 25
Action: native_transfer
Report hash: `0xb4edc42f88788e67851ca8e06cfb92cb0c7d41e4a992cc84be970587acd3b6ff`

Summary: WARN: native transfer classified as low risk.

AgentWarden decoded the transaction as native transfer and found 1 issue before signing. Primary finding: Native transfer recipient has contract bytecode.

Findings:
- MEDIUM TARGET_IS_CONTRACT: Native transfer recipient has contract bytecode. Evidence: expected=EOA recipient unless explicitly intended, actual=0x3333333333333333333333333333333333333333.

Recommended action: Require explicit human or policy confirmation before signing this transaction.

## State-aware lookup failure warning

Payload: `state-lookup-failure`
Source: Generic
Verdict: WARN
Risk score: 25
Action: erc20_transfer
Report hash: `0xbd2ea3b9b5667df62de6c95bd4ed2c2567f5463e046b6d366d453cedcfd83a2f`

Summary: WARN: erc20 transfer classified as low risk.

AgentWarden decoded the transaction as erc20 transfer and found 1 issue before signing. Primary finding: Live chain state lookup failed before signing.

Findings:
- MEDIUM STATE_LOOKUP_FAILED: Live chain state lookup failed before signing. Evidence: expected=erc20.balanceOf succeeds, actual=0x2222222222222222222222222222222222222222: mock RPC unavailable.

Recommended action: Require explicit human or policy confirmation before signing this transaction.

## EIP-3009 transfer authorization

Payload: `typed-data-transfer-authorization`
Source: Generic
Verdict: BLOCK
Risk score: 100
Action: transfer_authorization_signature
Report hash: `0x12c768dd1c16eb62efbcf6a87e523cbba09e9a1f3638661d9f1d8beb9f7d09ae`

Summary: BLOCK: transfer_authorization_signature classified as risk 100.

AgentWarden found 1 signature issue(s). Primary finding: Transfer authorization typed data can authorize token movement without a normal transaction prepared by the agent.

Findings:
- CRITICAL TRANSFER_AUTHORIZATION_SIGNATURE: Transfer authorization typed data can authorize token movement without a normal transaction prepared by the agent. Evidence: explicit transfer authorization review, TransferWithAuthorization.

Recommended action: Decode the typed-data execution target and require explicit bounded intent before signing.

## Blind eth_sign request

Payload: `blind-eth-sign`
Source: Generic
Verdict: BLOCK
Risk score: 100
Action: unknown_signature
Report hash: `0x43bb5a7ba09b4d2f1ee509607f3fef33e1c1a00d5dd7cb29eefa464c87a6623f`

Summary: BLOCK: unknown_signature classified as risk 100.

AgentWarden found 1 signature issue(s). Primary finding: eth_sign payloads are opaque and must not be approved automatically.

Findings:
- CRITICAL BLIND_ETH_SIGN: eth_sign payloads are opaque and must not be approved automatically.

Recommended action: Reject blind eth_sign requests and require structured EIP-712 typed data with an explicit intent.

## EIP-4337 bundle containing approval selector

Payload: `eip4337-hidden-approval`
Source: Generic
Verdict: BLOCK
Risk score: 85
Action: account_abstraction
Report hash: `0xb89655c42932616c4347f121f866b02f4645cbed74607104f990848624ef21b4`

Summary: BLOCK: account abstraction classified as high risk.

AgentWarden decoded the transaction as account abstraction and found 2 issues before signing. Primary finding: EIP-4337 handleOps transaction detected. V1 must recursively unwrap UserOperation callData before allowing it.

Findings:
- CRITICAL EIP4337_USEROP_REQUIRES_RECURSIVE_REVIEW: EIP-4337 handleOps transaction detected. V1 must recursively unwrap UserOperation callData before allowing it. Evidence: expected=fully decoded UserOperation callData, actual=erc4337.handleOps.
- MEDIUM APPROVAL_ERC20: ERC-20 allowance change. Evidence: standard=erc20, token=0x6666666666666666666666666666666666666666.

Recommended action: Unwrap every EIP-4337 UserOperation callData item and analyze each inner transaction before signing or bundling.

## Native value attached to token transfer calldata

Payload: `native-value-hidden-in-contract-call`
Source: AgentKit
Verdict: BLOCK
Risk score: 50
Action: erc20_transfer
Report hash: `0x91e1b9056e71a88782e5bdf2c4bae549afc52091415b13a5326a9a9e12b53f8e`

Summary: BLOCK: erc20 transfer classified as medium risk.

AgentWarden decoded the transaction as erc20 transfer and found 1 issue before signing. Primary finding: Transaction includes native value but intent did not explicitly allow it.

Findings:
- HIGH UNEXPECTED_NATIVE_VALUE: Transaction includes native value but intent did not explicitly allow it. Evidence: expected=0, actual=1.

Recommended action: Do not sign this transaction. Regenerate it from trusted intent or remove the risky operation.

## Unknown contract selector

Payload: `unknown-selector`
Source: Generic
Verdict: BLOCK
Risk score: 80
Action: unknown_contract_call
Report hash: `0x6f3e44cc67b151a2e62a2ff6611d4e7c1dc0544394a7b9dde73a60c9563f9b11`

Summary: BLOCK: unknown contract call classified as high risk.

AgentWarden decoded the transaction as unknown contract call and found 1 issue before signing. Primary finding: Calldata selector is unsupported by the MVP decoder.

Findings:
- HIGH UNKNOWN_FUNCTION_SELECTOR: Calldata selector is unsupported by the MVP decoder. Evidence: actual=0xdeadbeef.

Recommended action: Route this transaction to a full ABI-aware decoder and simulator before signing.

## Contract deployment transaction

Payload: `contract-deployment`
Source: Generic
Verdict: ALLOW
Risk score: 35
Action: deployment
Report hash: `0x9e43f30562019acff1064bdd715ae480b539aa42d3828c12e77a507e37138ca6`

Summary: ALLOW: deployment classified as low risk.

AgentWarden decoded the transaction as deployment and found no deterministic policy violations before signing. Static analysis only. Set ANALYSIS_RPC_URL to run eth_call simulation.

Findings:
- None

Recommended action: Proceed only if the signer recognizes the recipient, asset, amount, and target contract.

## Known router swap selector

Payload: `known-swap-selector`
Source: Eliza
Verdict: ALLOW
Risk score: 25
Action: swap
Report hash: `0xceca702f88efb76e96834cbb001ee380df073b38461c058805148e76464b152f`

Summary: ALLOW: swap classified as low risk.

AgentWarden decoded the transaction as swap and found no deterministic policy violations before signing. Static analysis only. Set ANALYSIS_RPC_URL to run eth_call simulation.

Findings:
- None

Recommended action: Proceed only if the signer recognizes the recipient, asset, amount, and target contract.

