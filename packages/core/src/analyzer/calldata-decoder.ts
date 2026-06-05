import type { TransactionIntent } from "../types/intent.types.js";
import { decodeFunctionData, parseAbi } from "viem";
import type {
  Address,
  DecodedAction,
  DecodedTransaction,
  Hex,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";
import {
  MULTICALL_SELECTORS,
  ACCOUNT_ABSTRACTION_SELECTORS,
  PERMIT_SELECTORS,
  SELECTORS,
  SWAP_SELECTORS,
  selectorLabel
} from "../registry/selector-registry.js";
import {
  decodeAddressWord,
  normalizeAddress,
  normalizeHexData,
  parseUint256Word,
  strip0x
} from "../utils/validation.js";

export const ERC20_TRANSFER_SELECTOR = SELECTORS.erc20Transfer;
export const ERC20_APPROVE_SELECTOR = SELECTORS.erc20Approve;
const MAX_RECURSIVE_DEPTH = 4;
const MAX_MULTICALL_CHILDREN = 25;
const MULTICALL_BYTES_ABI = parseAbi(["function multicall(bytes[] data)"]);
const MULTICALL_DEADLINE_BYTES_ABI = parseAbi([
  "function multicall(uint256 deadline, bytes[] data)"
]);
const MULTICALL3_AGGREGATE_ABI = parseAbi([
  "function aggregate((address target, bytes callData)[] calls)"
]);
const MULTICALL3_TRY_AGGREGATE_ABI = parseAbi([
  "function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls)"
]);
const MULTICALL3_AGGREGATE3_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls)"
]);
const MULTICALL3_AGGREGATE3_VALUE_ABI = parseAbi([
  "function aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[] calls)"
]);

export function decodeCalldata(
  transaction: UnsignedEvmTransaction,
  intent?: TransactionIntent,
  depth = 0
): DecodedTransaction {
  const data = normalizeHexData(transaction.data);

  if (!transaction.to) {
    return withActions({
      functionName: "contract.deployment",
      actionType: "deployment",
      selector: "0x",
      warnings: data === "0x" ? ["Deployment has empty initcode"] : []
    });
  }

  const selector = data.length >= 10 ? (data.slice(0, 10) as Hex) : ("0x" as Hex);

  if (data === "0x" && BigInt(transaction.value ?? "0") > 0n) {
    return withActions({
      functionName: "native.transfer",
      actionType: "native_transfer",
      selector,
      recipient: normalizeAddress(transaction.to),
      amount: transaction.value ?? "0",
      rawAmount: BigInt(transaction.value ?? "0"),
      warnings: []
    });
  }

  if (selector === SELECTORS.erc20Transfer) {
    return withActions(decodeErc20Transfer(transaction, selector));
  }

  if (selector === SELECTORS.erc20Approve) {
    const approval = decodeApprovalLike(transaction, selector, intent);
    return withActions(approval);
  }

  if (selector === SELECTORS.erc20TransferFrom) {
    return withActions(decodeTransferFromLike(transaction, selector, intent));
  }

  if (selector === SELECTORS.erc721SetApprovalForAll) {
    return withActions(decodeOperatorApproval(transaction, selector, intent));
  }

  if (
    selector === SELECTORS.erc721SafeTransferFrom ||
    selector === SELECTORS.erc721SafeTransferFromWithData
  ) {
    return withActions(
      decodeNftTransfer(transaction, selector, "erc721.safeTransferFrom")
    );
  }

  if (selector === SELECTORS.erc1155SafeTransferFrom) {
    return withActions(decodeErc1155Transfer(transaction, selector));
  }

  if (selector === SELECTORS.erc1155SafeBatchTransferFrom) {
    return withActions(decodeErc1155BatchTransfer(transaction, selector));
  }

  if (MULTICALL_SELECTORS.has(selector)) {
    return withActions(decodeMulticall(transaction, selector, intent, depth));
  }

  if (PERMIT_SELECTORS.has(selector)) {
    return withActions(decodePermitSignature(transaction, selector));
  }

  if (ACCOUNT_ABSTRACTION_SELECTORS.has(selector)) {
    return withActions(decodeAccountAbstraction(transaction, selector));
  }

  if (SWAP_SELECTORS.has(selector)) {
    return withActions(decodeSwap(transaction, selector));
  }

  return withActions({
    functionName: "unknown",
    actionType: "unknown_contract_call",
    selector,
    contractAddress: normalizeAddress(transaction.to),
    tokenAddress: normalizeAddress(transaction.to),
    warnings: [`Unsupported function selector ${selector}`]
  });
}

function decodeErc20Transfer(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): DecodedTransaction {
  const words = getWords(transaction.data, 2);
  if (!words) {
    return malformed(selector, transaction, "Malformed ERC-20 transfer calldata");
  }

  const recipient = decodeAddressWord(words[0]);
  const rawAmount = parseUint256Word(words[1]);

  return {
    functionName: "erc20.transfer",
    actionType: "erc20_transfer",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    recipient,
    amount: rawAmount.toString(),
    rawAmount,
    warnings: []
  };
}

function decodeApprovalLike(
  transaction: UnsignedEvmTransaction,
  selector: Hex,
  intent?: TransactionIntent
): DecodedTransaction {
  const words = getWords(transaction.data, 2);
  if (!words) {
    return malformed(selector, transaction, "Malformed approval calldata");
  }

  const spender = decodeAddressWord(words[0]);
  const rawAmountOrTokenId = parseUint256Word(words[1]);
  const isNftIntent = intent?.action === "nft_transfer" || intent?.tokenId !== undefined;

  if (isNftIntent) {
    return {
      functionName: "erc721.approve",
      actionType: "erc721_approval",
      selector,
      contractAddress: normalizeAddress(transaction.to!),
      tokenAddress: normalizeAddress(transaction.to!),
      spender,
      tokenId: rawAmountOrTokenId.toString(),
      warnings: [
        "ERC-721 approve shares selector with ERC-20 approve; classified from intent."
      ]
    };
  }

  return {
    functionName: "erc20.approve",
    actionType: "erc20_approval",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    spender,
    amount: rawAmountOrTokenId.toString(),
    rawAmount: rawAmountOrTokenId,
    warnings: []
  };
}

function decodeTransferFromLike(
  transaction: UnsignedEvmTransaction,
  selector: Hex,
  intent?: TransactionIntent
): DecodedTransaction {
  const words = getWords(transaction.data, 3);
  if (!words) {
    return malformed(selector, transaction, "Malformed transferFrom calldata");
  }

  const from = decodeAddressWord(words[0]);
  const recipient = decodeAddressWord(words[1]);
  const rawAmountOrTokenId = parseUint256Word(words[2]);
  const isNftIntent = intent?.action === "nft_transfer" || intent?.tokenId !== undefined;

  if (isNftIntent) {
    return {
      functionName: "erc721.transferFrom",
      actionType: "erc721_transfer",
      selector,
      contractAddress: normalizeAddress(transaction.to!),
      tokenAddress: normalizeAddress(transaction.to!),
      recipient,
      tokenId: rawAmountOrTokenId.toString(),
      decodedActions: [],
      warnings: [
        "transferFrom shares selector across ERC-20 and ERC-721; classified from intent."
      ]
    };
  }

  return {
    functionName: "erc20.transferFrom",
    actionType: "erc20_transfer",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    recipient,
    amount: rawAmountOrTokenId.toString(),
    rawAmount: rawAmountOrTokenId,
    decodedActions: [],
    warnings: [`transferFrom source ${from}`]
  };
}

function decodeOperatorApproval(
  transaction: UnsignedEvmTransaction,
  selector: Hex,
  intent?: TransactionIntent
): DecodedTransaction {
  const words = getWords(transaction.data, 2);
  if (!words) {
    return malformed(selector, transaction, "Malformed setApprovalForAll calldata");
  }

  const operator = decodeAddressWord(words[0]);
  const approved = parseUint256Word(words[1]) !== 0n;
  const standard = intent?.action === "nft_transfer" ? "erc721" : "erc1155";

  return {
    functionName:
      standard === "erc721" ? "erc721.setApprovalForAll" : "erc1155.setApprovalForAll",
    actionType:
      standard === "erc721" ? "erc721_operator_approval" : "erc1155_operator_approval",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    operator,
    approved,
    warnings: ["setApprovalForAll authorizes collection-wide operator permissions."]
  };
}

function decodeNftTransfer(
  transaction: UnsignedEvmTransaction,
  selector: Hex,
  functionName: "erc721.safeTransferFrom"
): DecodedTransaction {
  const words = getWords(transaction.data, 3);
  if (!words) {
    return malformed(selector, transaction, "Malformed ERC-721 transfer calldata");
  }

  const recipient = decodeAddressWord(words[1]);
  const tokenId = parseUint256Word(words[2]).toString();

  return {
    functionName,
    actionType: "erc721_transfer",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    recipient,
    tokenId,
    warnings: []
  };
}

function decodeErc1155Transfer(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): DecodedTransaction {
  const words = getWords(transaction.data, 5);
  if (!words) {
    return malformed(selector, transaction, "Malformed ERC-1155 transfer calldata");
  }

  const recipient = decodeAddressWord(words[1]);
  const tokenId = parseUint256Word(words[2]).toString();
  const rawAmount = parseUint256Word(words[3]);

  return {
    functionName: "erc1155.safeTransferFrom",
    actionType: "erc1155_transfer",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    recipient,
    tokenId,
    amount: rawAmount.toString(),
    rawAmount,
    warnings: []
  };
}

function decodeErc1155BatchTransfer(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): DecodedTransaction {
  return {
    functionName: "erc1155.safeBatchTransferFrom",
    actionType: "erc1155_batch_transfer",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    warnings: [
      "ERC-1155 batch transfer detected; dynamic token arrays are summarized in V1."
    ]
  };
}

function decodeSwap(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): DecodedTransaction {
  return {
    functionName: "router.swap",
    actionType: "swap",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    warnings: [`Known router swap selector ${selectorLabel(selector)}`]
  };
}

function decodePermitSignature(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): DecodedTransaction {
  const functionName = selectorLabel(selector);

  return {
    functionName:
      functionName === "permit2.permitTransferFrom"
        ? "permit2.permitTransferFrom"
        : functionName === "permit2.permit"
          ? "permit2.permit"
          : "erc20.permit",
    actionType: "permit_signature",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    tokenAddress: normalizeAddress(transaction.to!),
    warnings: [
      "Permit-style approval detected. This may authorize token spending through signed data rather than an ERC-20 approve transaction."
    ]
  };
}

function decodeAccountAbstraction(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): DecodedTransaction {
  const nestedActions: DecodedAction[] = [];
  const lowerData = transaction.data.toLowerCase();

  if (lowerData.includes(SELECTORS.erc20Approve.slice(2))) {
    nestedActions.push({
      actionType: "erc20_approval",
      functionName: "erc20.approve",
      selector: SELECTORS.erc20Approve,
      contractAddress: normalizeAddress(transaction.to!),
      assetStandard: "erc20",
      warnings: ["Nested approval selector detected inside EIP-4337 calldata."]
    });
  }

  if (lowerData.includes(SELECTORS.erc721SetApprovalForAll.slice(2))) {
    nestedActions.push({
      actionType: "erc721_operator_approval",
      functionName: "erc721.setApprovalForAll",
      selector: SELECTORS.erc721SetApprovalForAll,
      contractAddress: normalizeAddress(transaction.to!),
      assetStandard: "erc721",
      warnings: ["Nested operator approval selector detected inside EIP-4337 calldata."]
    });
  }

  return {
    functionName: "erc4337.handleOps",
    actionType: "account_abstraction",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    decodedActions: nestedActions,
    warnings: [
      "EIP-4337 handleOps-style transaction detected. UserOperation callData requires recursive review before signing."
    ]
  };
}

function decodeMulticall(
  transaction: UnsignedEvmTransaction,
  selector: Hex,
  intent: TransactionIntent | undefined,
  depth: number
): DecodedTransaction {
  const decodedChildren = decodeMulticallChildren(transaction, selector, intent, depth);
  if (decodedChildren) {
    return {
      functionName: "multicall",
      actionType: "multicall",
      selector,
      contractAddress: normalizeAddress(transaction.to!),
      decodedActions: decodedChildren.actions,
      warnings: decodedChildren.warnings
    };
  }

  const nestedWarnings: string[] = [];
  const nestedActions: DecodedAction[] = [];
  const lowerData = transaction.data.toLowerCase();

  if (lowerData.includes(SELECTORS.erc20Approve.slice(2))) {
    nestedWarnings.push("Nested approval selector detected inside multicall payload.");
    nestedActions.push({
      actionType: "erc20_approval",
      functionName: "erc20.approve",
      selector: SELECTORS.erc20Approve,
      contractAddress: normalizeAddress(transaction.to!),
      assetStandard: "erc20",
      warnings: ["Nested approval selector detected by static scan."]
    });
  }

  if (lowerData.includes(SELECTORS.erc721SetApprovalForAll.slice(2))) {
    nestedWarnings.push(
      "Nested setApprovalForAll selector detected inside multicall payload."
    );
    nestedActions.push({
      actionType: "erc721_operator_approval",
      functionName: "erc721.setApprovalForAll",
      selector: SELECTORS.erc721SetApprovalForAll,
      contractAddress: normalizeAddress(transaction.to!),
      assetStandard: "erc721",
      warnings: ["Nested operator approval selector detected by static scan."]
    });
  }

  if (
    [...SWAP_SELECTORS].some((swapSelector) => lowerData.includes(swapSelector.slice(2)))
  ) {
    nestedWarnings.push("Nested swap selector detected inside multicall payload.");
    nestedActions.push({
      actionType: "swap",
      functionName: "router.swap",
      selector,
      contractAddress: normalizeAddress(transaction.to!),
      warnings: ["Nested swap selector detected by static scan."]
    });
  }

  return {
    functionName: "multicall",
    actionType: "multicall",
    selector,
    contractAddress: normalizeAddress(transaction.to!),
    decodedActions: nestedActions,
    warnings: nestedWarnings
  };
}

function decodeMulticallChildren(
  transaction: UnsignedEvmTransaction,
  selector: Hex,
  intent: TransactionIntent | undefined,
  depth: number
): { actions: DecodedAction[]; warnings: string[] } | undefined {
  if (depth >= MAX_RECURSIVE_DEPTH) {
    return {
      actions: [],
      warnings: [`Multicall recursion depth limit ${MAX_RECURSIVE_DEPTH} reached.`]
    };
  }

  const calls = extractMulticallCalls(transaction, selector);
  if (!calls || calls.length === 0) {
    return undefined;
  }

  const limitedCalls = calls.slice(0, MAX_MULTICALL_CHILDREN);
  const actions = limitedCalls.flatMap((call, index) => {
    const child = decodeCalldata(
      {
        chainId: transaction.chainId,
        from: transaction.from,
        to: call.target,
        value: call.value?.toString() ?? "0",
        data: call.data
      },
      intent,
      depth + 1
    );

    return (child.decodedActions ?? []).map((action) => ({
      ...action,
      warnings: [
        `Decoded from multicall child ${index}.`,
        ...(call.value && call.value > 0n
          ? [`Child call carries native value ${call.value.toString()}.`]
          : []),
        ...action.warnings
      ]
    }));
  });
  const warnings = [
    `Decoded ${limitedCalls.length} multicall child call${limitedCalls.length === 1 ? "" : "s"}.`
  ];

  if (calls.length > MAX_MULTICALL_CHILDREN) {
    warnings.push(
      `Multicall child limit ${MAX_MULTICALL_CHILDREN} reached; ${calls.length - MAX_MULTICALL_CHILDREN} call(s) were not decoded.`
    );
  }

  return { actions, warnings };
}

function extractMulticallCalls(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): Array<{ target: Address; data: Hex; value?: bigint }> | undefined {
  try {
    if (selector === SELECTORS.multicallBytes) {
      const decoded = decodeFunctionData({
        abi: MULTICALL_BYTES_ABI,
        data: transaction.data
      });
      return decoded.args[0].map((data) => ({
        target: normalizeAddress(transaction.to!),
        data: normalizeHexData(data)
      }));
    }

    if (selector === SELECTORS.multicallDeadlineBytes) {
      const decoded = decodeFunctionData({
        abi: MULTICALL_DEADLINE_BYTES_ABI,
        data: transaction.data
      });
      return decoded.args[1].map((data) => ({
        target: normalizeAddress(transaction.to!),
        data: normalizeHexData(data)
      }));
    }

    if (selector === SELECTORS.multicall3Aggregate) {
      const decoded = decodeFunctionData({
        abi: MULTICALL3_AGGREGATE_ABI,
        data: transaction.data
      });
      return decoded.args[0].map((call) => ({
        target: normalizeAddress(call.target),
        data: normalizeHexData(call.callData)
      }));
    }

    if (selector === SELECTORS.multicall3TryAggregate) {
      const decoded = decodeFunctionData({
        abi: MULTICALL3_TRY_AGGREGATE_ABI,
        data: transaction.data
      });
      return decoded.args[1].map((call) => ({
        target: normalizeAddress(call.target),
        data: normalizeHexData(call.callData)
      }));
    }

    if (selector === SELECTORS.multicall3Aggregate3) {
      const decoded = decodeFunctionData({
        abi: MULTICALL3_AGGREGATE3_ABI,
        data: transaction.data
      });
      return decoded.args[0].map((call) => ({
        target: normalizeAddress(call.target),
        data: normalizeHexData(call.callData)
      }));
    }

    if (selector === SELECTORS.multicall3Aggregate3Value) {
      const decoded = decodeFunctionData({
        abi: MULTICALL3_AGGREGATE3_VALUE_ABI,
        data: transaction.data
      });
      return decoded.args[0].map((call) => ({
        target: normalizeAddress(call.target),
        data: normalizeHexData(call.callData),
        value: call.value
      }));
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getWords(data: string, count: number): string[] | undefined {
  const body = strip0x(data).slice(8);
  if (body.length < count * 64) {
    return undefined;
  }

  return Array.from({ length: count }, (_, index) =>
    body.slice(index * 64, (index + 1) * 64)
  );
}

function malformed(
  selector: Hex,
  transaction: UnsignedEvmTransaction,
  message: string
): DecodedTransaction {
  return withActions({
    functionName: "unknown",
    actionType: "unknown_contract_call",
    selector,
    contractAddress: transaction.to ? normalizeAddress(transaction.to) : undefined,
    tokenAddress: transaction.to ? normalizeAddress(transaction.to) : undefined,
    warnings: [message]
  });
}

function withActions(decoded: DecodedTransaction): DecodedTransaction {
  const action: DecodedAction = {
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

  return {
    ...decoded,
    decodedActions: decoded.decodedActions?.length
      ? [action, ...decoded.decodedActions]
      : [action]
  };
}

function inferAssetStandard(decoded: DecodedTransaction): DecodedAction["assetStandard"] {
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
