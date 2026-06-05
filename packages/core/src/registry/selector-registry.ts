import type { DecodedFunctionName, Hex } from "../types/transaction.types.js";

export const SELECTORS = {
  erc20Transfer: "0xa9059cbb",
  erc20Approve: "0x095ea7b3",
  erc20TransferFrom: "0x23b872dd",
  erc721Approve: "0x095ea7b3",
  erc721SetApprovalForAll: "0xa22cb465",
  erc721TransferFrom: "0x23b872dd",
  erc721SafeTransferFrom: "0x42842e0e",
  erc721SafeTransferFromWithData: "0xb88d4fde",
  erc1155SetApprovalForAll: "0xa22cb465",
  erc1155SafeTransferFrom: "0xf242432a",
  erc1155SafeBatchTransferFrom: "0x2eb2c2d6",
  multicallBytes: "0xac9650d8",
  multicallDeadlineBytes: "0x5ae401dc",
  multicall3Aggregate: "0x252dba42",
  multicall3TryAggregate: "0xbce38bd7",
  multicall3Aggregate3: "0x82ad56cb",
  multicall3Aggregate3Value: "0x174dea71",
  uniswapV2SwapExactTokensForTokens: "0x38ed1739",
  uniswapV2SwapTokensForExactTokens: "0x8803dbee",
  uniswapV2SwapExactEthForTokens: "0x7ff36ab5",
  uniswapV2SwapExactTokensForEth: "0x18cbafe5",
  uniswapV3ExactInputSingle: "0x414bf389",
  uniswapV3ExactInput: "0xc04b8d59",
  uniswapV3ExactOutputSingle: "0xdb3e2198",
  uniswapV3ExactOutput: "0xf28c0498",
  eip2612Permit: "0xd505accf",
  daiLikePermit: "0x8fcbaf0c",
  permit2PermitSingle: "0x2b67b570",
  permit2PermitBatch: "0x56684434",
  permit2PermitTransferFrom: "0x6949bce4",
  permit2PermitWitnessTransferFrom: "0xf443b753",
  erc4337HandleOps: "0x1fad948c",
  erc4337HandleAggregatedOps: "0x73695b59"
} as const satisfies Record<string, Hex>;

export const SWAP_SELECTORS = new Set<Hex>([
  SELECTORS.uniswapV2SwapExactTokensForTokens,
  SELECTORS.uniswapV2SwapTokensForExactTokens,
  SELECTORS.uniswapV2SwapExactEthForTokens,
  SELECTORS.uniswapV2SwapExactTokensForEth,
  SELECTORS.uniswapV3ExactInputSingle,
  SELECTORS.uniswapV3ExactInput,
  SELECTORS.uniswapV3ExactOutputSingle,
  SELECTORS.uniswapV3ExactOutput
]);

export const MULTICALL_SELECTORS = new Set<Hex>([
  SELECTORS.multicallBytes,
  SELECTORS.multicallDeadlineBytes,
  SELECTORS.multicall3Aggregate,
  SELECTORS.multicall3TryAggregate,
  SELECTORS.multicall3Aggregate3,
  SELECTORS.multicall3Aggregate3Value
]);

export const PERMIT_SELECTORS = new Set<Hex>([
  SELECTORS.eip2612Permit,
  SELECTORS.daiLikePermit,
  SELECTORS.permit2PermitSingle,
  SELECTORS.permit2PermitBatch,
  SELECTORS.permit2PermitTransferFrom,
  SELECTORS.permit2PermitWitnessTransferFrom
]);

export const ACCOUNT_ABSTRACTION_SELECTORS = new Set<Hex>([
  SELECTORS.erc4337HandleOps,
  SELECTORS.erc4337HandleAggregatedOps
]);

export function selectorLabel(selector: Hex): DecodedFunctionName {
  if (selector === SELECTORS.erc20Transfer) {
    return "erc20.transfer";
  }

  if (selector === SELECTORS.erc20Approve) {
    return "erc20.approve";
  }

  if (selector === SELECTORS.erc20TransferFrom) {
    return "erc20.transferFrom";
  }

  if (selector === SELECTORS.erc721SetApprovalForAll) {
    return "erc721.setApprovalForAll";
  }

  if (selector === SELECTORS.erc1155SafeTransferFrom) {
    return "erc1155.safeTransferFrom";
  }

  if (selector === SELECTORS.erc1155SafeBatchTransferFrom) {
    return "erc1155.safeBatchTransferFrom";
  }

  if (MULTICALL_SELECTORS.has(selector)) {
    return "multicall";
  }

  if (selector === SELECTORS.eip2612Permit || selector === SELECTORS.daiLikePermit) {
    return "erc20.permit";
  }

  if (
    selector === SELECTORS.permit2PermitSingle ||
    selector === SELECTORS.permit2PermitBatch
  ) {
    return "permit2.permit";
  }

  if (
    selector === SELECTORS.permit2PermitTransferFrom ||
    selector === SELECTORS.permit2PermitWitnessTransferFrom
  ) {
    return "permit2.permitTransferFrom";
  }

  if (ACCOUNT_ABSTRACTION_SELECTORS.has(selector)) {
    return "erc4337.handleOps";
  }

  if (SWAP_SELECTORS.has(selector)) {
    return "router.swap";
  }

  return "unknown";
}
