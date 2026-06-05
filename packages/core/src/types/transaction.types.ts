export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface UnsignedEvmTransaction {
  chainId: number;
  from: Address;
  to?: Address;
  value?: string;
  data: Hex;
  type?: number | string;
  accessList?: unknown[];
  authorizationList?: unknown[];
  blobVersionedHashes?: Hex[];
  maxFeePerBlobGas?: string;
}

export type TransactionEnvelopeType =
  | "legacy"
  | "access_list"
  | "eip1559"
  | "blob"
  | "eip7702"
  | "unknown";

export type ActionType =
  | "native_transfer"
  | "deployment"
  | "erc20_transfer"
  | "erc20_approval"
  | "erc721_transfer"
  | "erc721_approval"
  | "erc721_operator_approval"
  | "erc1155_transfer"
  | "erc1155_batch_transfer"
  | "erc1155_operator_approval"
  | "swap"
  | "multicall"
  | "permit_signature"
  | "account_abstraction"
  | "unknown_contract_call";

export type DecodedFunctionName =
  | "erc20.transfer"
  | "erc20.approve"
  | "erc20.transferFrom"
  | "erc721.approve"
  | "erc721.setApprovalForAll"
  | "erc721.transferFrom"
  | "erc721.safeTransferFrom"
  | "erc1155.setApprovalForAll"
  | "erc1155.safeTransferFrom"
  | "erc1155.safeBatchTransferFrom"
  | "router.swap"
  | "multicall"
  | "erc20.permit"
  | "permit2.permit"
  | "permit2.permitTransferFrom"
  | "erc4337.handleOps"
  | "native.transfer"
  | "contract.deployment"
  | "unknown";

export interface TransactionEnvelope {
  type: TransactionEnvelopeType;
  rawType?: number | string;
  hasAccessList: boolean;
  hasBlobFields: boolean;
  hasAuthorizationList: boolean;
}

export interface DecodedAction {
  actionType: ActionType;
  functionName: DecodedFunctionName;
  selector: Hex;
  contractAddress?: Address;
  tokenAddress?: Address;
  assetStandard?: "native" | "erc20" | "erc721" | "erc1155" | "unknown";
  from?: Address;
  recipient?: Address;
  spender?: Address;
  operator?: Address;
  approved?: boolean;
  amount?: string;
  tokenId?: string;
  tokenIds?: string[];
  rawAmount?: bigint;
  warnings: string[];
}

export type ExecutionGraphNodeKind =
  | "root"
  | "nested_call"
  | "multicall_child"
  | "user_operation_hint";

export interface ExecutionGraphNode {
  id: string;
  parentId?: string;
  depth: number;
  kind: ExecutionGraphNodeKind;
  actionType: ActionType;
  functionName: DecodedFunctionName;
  selector: Hex;
  contractAddress?: Address;
  tokenAddress?: Address;
  assetStandard?: "native" | "erc20" | "erc721" | "erc1155" | "unknown";
  from?: Address;
  recipient?: Address;
  spender?: Address;
  operator?: Address;
  approved?: boolean;
  amount?: string;
  tokenId?: string;
  tokenIds?: string[];
  warnings: string[];
  evidence: string[];
}

export interface ExecutionGraphEdge {
  from: string;
  to: string;
  relationship:
    | "contains"
    | "approves"
    | "transfers"
    | "delegates"
    | "executes"
    | "unknown";
}

export interface ExecutionGraph {
  rootNodeId: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
  maxDepth: number;
  hasNestedExecution: boolean;
  hasUnknownNode: boolean;
}

export interface DecodedTransaction {
  functionName: DecodedFunctionName;
  actionType?: ActionType;
  selector: Hex;
  contractAddress?: Address;
  tokenAddress?: Address;
  recipient?: Address;
  spender?: Address;
  operator?: Address;
  approved?: boolean;
  amount?: string;
  tokenId?: string;
  rawAmount?: bigint;
  decodedActions?: DecodedAction[];
  warnings: string[];
}

export interface TokenBalanceDelta {
  assetStandard?: "native" | "erc20" | "erc721" | "erc1155" | "unknown";
  tokenAddress: Address;
  account: Address;
  delta: string;
  tokenId?: string;
}

export interface ApprovalFinding {
  standard: "erc20" | "erc721" | "erc1155";
  owner: Address;
  tokenAddress: Address;
  spender?: Address;
  operator?: Address;
  amount?: string;
  tokenId?: string;
  approved?: boolean;
  isUnlimited?: boolean;
  isOperatorApproval?: boolean;
  risk: "low" | "medium" | "high" | "critical";
  message: string;
}
