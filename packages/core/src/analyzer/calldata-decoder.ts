import type { TransactionIntent } from "../types/intent.types.js";
import type {
  DecodedAction,
  DecodedTransaction,
  Hex,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";
import {
  MULTICALL_SELECTORS,
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

export function decodeCalldata(
  transaction: UnsignedEvmTransaction,
  intent?: TransactionIntent
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
    return withActions(decodeNftTransfer(transaction, selector, "erc721.safeTransferFrom"));
  }

  if (selector === SELECTORS.erc1155SafeTransferFrom) {
    return withActions(decodeErc1155Transfer(transaction, selector));
  }

  if (selector === SELECTORS.erc1155SafeBatchTransferFrom) {
    return withActions(decodeErc1155BatchTransfer(transaction, selector));
  }

  if (MULTICALL_SELECTORS.has(selector)) {
    return withActions(decodeMulticall(transaction, selector));
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
      warnings: ["ERC-721 approve shares selector with ERC-20 approve; classified from intent."]
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
      warnings: ["transferFrom shares selector across ERC-20 and ERC-721; classified from intent."]
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
    warnings: ["setApprovalForAll grants collection-wide operator permissions."]
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
    warnings: ["ERC-1155 batch transfer detected; dynamic token arrays are summarized in V1."]
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

function decodeMulticall(
  transaction: UnsignedEvmTransaction,
  selector: Hex
): DecodedTransaction {
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
    nestedWarnings.push("Nested setApprovalForAll selector detected inside multicall payload.");
    nestedActions.push({
      actionType: "erc721_operator_approval",
      functionName: "erc721.setApprovalForAll",
      selector: SELECTORS.erc721SetApprovalForAll,
      contractAddress: normalizeAddress(transaction.to!),
      assetStandard: "erc721",
      warnings: ["Nested operator approval selector detected by static scan."]
    });
  }

  if ([...SWAP_SELECTORS].some((swapSelector) => lowerData.includes(swapSelector.slice(2)))) {
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

function inferAssetStandard(
  decoded: DecodedTransaction
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
