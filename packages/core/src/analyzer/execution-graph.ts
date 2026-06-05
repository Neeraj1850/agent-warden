import type {
  ActionType,
  DecodedAction,
  DecodedTransaction,
  ExecutionGraph,
  ExecutionGraphEdge,
  ExecutionGraphNode,
  ExecutionGraphNodeKind,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";
import { normalizeAddress } from "../utils/validation.js";

export function buildExecutionGraph(
  transaction: UnsignedEvmTransaction,
  decoded: DecodedTransaction
): ExecutionGraph {
  const actions = decoded.decodedActions?.length
    ? decoded.decodedActions
    : [decodedTransactionToAction(decoded)];
  const rootAction = actions[0] ?? decodedTransactionToAction(decoded);
  const rootNode = actionToNode({
    action: rootAction,
    id: "node-0",
    depth: 0,
    kind: "root",
    transaction
  });
  const childNodes = actions.slice(1).map((action, index) =>
    actionToNode({
      action,
      id: `node-${index + 1}`,
      parentId: rootNode.id,
      depth: 1,
      kind: inferChildKind(rootAction.actionType),
      transaction
    })
  );
  const nodes = [rootNode, ...childNodes];
  const edges = childNodes.map(
    (node): ExecutionGraphEdge => ({
      from: rootNode.id,
      to: node.id,
      relationship: inferRelationship(node.actionType)
    })
  );

  return {
    rootNodeId: rootNode.id,
    nodes,
    edges,
    maxDepth: childNodes.length ? 1 : 0,
    hasNestedExecution: childNodes.length > 0,
    hasUnknownNode: nodes.some((node) => node.actionType === "unknown_contract_call")
  };
}

function actionToNode(input: {
  action: DecodedAction;
  id: string;
  parentId?: string;
  depth: number;
  kind: ExecutionGraphNodeKind;
  transaction: UnsignedEvmTransaction;
}): ExecutionGraphNode {
  const { action, id, parentId, depth, kind, transaction } = input;
  const evidence = buildEvidence(action, transaction);

  return {
    id,
    parentId,
    depth,
    kind,
    actionType: action.actionType,
    functionName: action.functionName,
    selector: action.selector,
    contractAddress: action.contractAddress,
    tokenAddress: action.tokenAddress,
    assetStandard: action.assetStandard,
    from: action.from,
    recipient: action.recipient,
    spender: action.spender,
    operator: action.operator,
    approved: action.approved,
    amount: action.amount,
    tokenId: action.tokenId,
    tokenIds: action.tokenIds,
    warnings: action.warnings,
    evidence
  };
}

function decodedTransactionToAction(decoded: DecodedTransaction): DecodedAction {
  return {
    actionType: decoded.actionType ?? "unknown_contract_call",
    functionName: decoded.functionName,
    selector: decoded.selector,
    contractAddress: decoded.contractAddress,
    tokenAddress: decoded.tokenAddress,
    assetStandard: inferAssetStandard(decoded),
    recipient: decoded.recipient,
    spender: decoded.spender,
    operator: decoded.operator,
    approved: decoded.approved,
    amount: decoded.amount,
    tokenId: decoded.tokenId,
    rawAmount: decoded.rawAmount,
    warnings: decoded.warnings
  };
}

function inferChildKind(rootActionType: ActionType): ExecutionGraphNodeKind {
  if (rootActionType === "account_abstraction") {
    return "user_operation_hint";
  }

  if (rootActionType === "multicall") {
    return "multicall_child";
  }

  return "nested_call";
}

function inferRelationship(actionType: ActionType): ExecutionGraphEdge["relationship"] {
  if (actionType.includes("approval")) {
    return "approves";
  }

  if (actionType.includes("transfer")) {
    return "transfers";
  }

  if (actionType === "account_abstraction") {
    return "executes";
  }

  return "contains";
}

function inferAssetStandard(
  decoded: Pick<DecodedTransaction, "functionName">
): DecodedAction["assetStandard"] {
  if (decoded.functionName.startsWith("erc20.")) {
    return "erc20";
  }

  if (decoded.functionName.startsWith("erc721.")) {
    return "erc721";
  }

  if (decoded.functionName.startsWith("erc1155.")) {
    return "erc1155";
  }

  if (decoded.functionName === "native.transfer") {
    return "native";
  }

  return "unknown";
}

function buildEvidence(
  action: DecodedAction,
  transaction: UnsignedEvmTransaction
): string[] {
  const evidence = [
    `selector:${action.selector}`,
    `action:${action.actionType}`,
    `tx.from:${normalizeAddress(transaction.from)}`
  ];

  if (action.contractAddress) {
    evidence.push(`contract:${action.contractAddress}`);
  }

  if (action.recipient) {
    evidence.push(`recipient:${action.recipient}`);
  }

  if (action.spender) {
    evidence.push(`spender:${action.spender}`);
  }

  if (action.operator) {
    evidence.push(`operator:${action.operator}`);
  }

  if (action.amount) {
    evidence.push(`amount:${action.amount}`);
  }

  if (action.tokenId) {
    evidence.push(`tokenId:${action.tokenId}`);
  }

  return evidence;
}
