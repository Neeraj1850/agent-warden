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
  uniswapV2SwapExactTokensForTokens: "0x38ed1739",
  uniswapV2SwapTokensForExactTokens: "0x8803dbee",
  uniswapV2SwapExactEthForTokens: "0x7ff36ab5",
  uniswapV2SwapExactTokensForEth: "0x18cbafe5",
  uniswapV3ExactInputSingle: "0x414bf389",
  uniswapV3ExactInput: "0xc04b8d59",
  uniswapV3ExactOutputSingle: "0xdb3e2198",
  uniswapV3ExactOutput: "0xf28c0498"
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
  SELECTORS.multicallDeadlineBytes
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

  if (SWAP_SELECTORS.has(selector)) {
    return "router.swap";
  }

  return "unknown";
}
