import type {
  DecodedTransaction,
  TokenBalanceDelta,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";

export function inferStaticBalanceDeltas(
  transaction: UnsignedEvmTransaction,
  decoded: DecodedTransaction
): TokenBalanceDelta[] {
  if (decoded.functionName === "native.transfer" && decoded.recipient && decoded.amount) {
    return [
      {
        assetStandard: "native",
        tokenAddress: "0x0000000000000000000000000000000000000000",
        account: transaction.from,
        delta: `-${decoded.amount}`
      },
      {
        assetStandard: "native",
        tokenAddress: "0x0000000000000000000000000000000000000000",
        account: decoded.recipient,
        delta: decoded.amount
      }
    ];
  }

  if (
    decoded.actionType === "erc721_transfer" &&
    decoded.tokenAddress &&
    decoded.recipient &&
    decoded.tokenId
  ) {
    return [
      {
        assetStandard: "erc721",
        tokenAddress: decoded.tokenAddress,
        account: transaction.from,
        delta: "-1",
        tokenId: decoded.tokenId
      },
      {
        assetStandard: "erc721",
        tokenAddress: decoded.tokenAddress,
        account: decoded.recipient,
        delta: "1",
        tokenId: decoded.tokenId
      }
    ];
  }

  if (
    decoded.actionType !== "erc20_transfer" &&
    decoded.actionType !== "erc1155_transfer"
  ) {
    return [];
  }

  if (!decoded.tokenAddress || !decoded.recipient || !decoded.amount) {
    return [];
  }

  const assetStandard = decoded.actionType === "erc1155_transfer" ? "erc1155" : "erc20";

  return [
    {
      assetStandard,
      tokenAddress: decoded.tokenAddress,
      account: transaction.from,
      delta: `-${decoded.amount}`,
      tokenId: decoded.tokenId
    },
    {
      assetStandard,
      tokenAddress: decoded.tokenAddress,
      account: decoded.recipient,
      delta: decoded.amount,
      tokenId: decoded.tokenId
    }
  ];
}
