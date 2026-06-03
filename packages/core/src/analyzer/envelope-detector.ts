import type {
  TransactionEnvelope,
  TransactionEnvelopeType,
  UnsignedEvmTransaction
} from "../types/transaction.types.js";

export function detectTransactionEnvelope(
  transaction: UnsignedEvmTransaction
): TransactionEnvelope {
  const hasAuthorizationList =
    Array.isArray(transaction.authorizationList) &&
    transaction.authorizationList.length > 0;
  const hasBlobFields =
    Boolean(transaction.maxFeePerBlobGas) ||
    Boolean(transaction.blobVersionedHashes?.length);
  const hasAccessList =
    Array.isArray(transaction.accessList) && transaction.accessList.length > 0;

  return {
    type: classifyEnvelopeType(transaction.type, {
      hasAccessList,
      hasBlobFields,
      hasAuthorizationList
    }),
    rawType: transaction.type,
    hasAccessList,
    hasBlobFields,
    hasAuthorizationList
  };
}

function classifyEnvelopeType(
  rawType: number | string | undefined,
  hints: {
    hasAccessList: boolean;
    hasBlobFields: boolean;
    hasAuthorizationList: boolean;
  }
): TransactionEnvelopeType {
  if (hints.hasAuthorizationList || rawType === 4 || rawType === "0x4") {
    return "eip7702";
  }

  if (hints.hasBlobFields || rawType === 3 || rawType === "0x3") {
    return "blob";
  }

  if (rawType === 2 || rawType === "0x2") {
    return "eip1559";
  }

  if (hints.hasAccessList || rawType === 1 || rawType === "0x1") {
    return "access_list";
  }

  if (rawType === undefined || rawType === 0 || rawType === "0x0") {
    return "legacy";
  }

  return "unknown";
}
