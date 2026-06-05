import type { AnalysisRequest } from "../types/report.types.js";
import type { IntentAction } from "../types/intent.types.js";
import type { Address, Hex, UnsignedEvmTransaction } from "../types/transaction.types.js";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const HEX_PATTERN = /^0x([a-fA-F0-9]{2})*$/;
const DECIMAL_PATTERN = /^\d+$/;
const INTENT_ACTIONS = new Set<IntentAction>([
  "transfer",
  "approve",
  "contract_call",
  "native_transfer",
  "token_transfer",
  "approval",
  "nft_transfer",
  "swap",
  "multicall",
  "deployment"
]);

export const MAX_CALLDATA_BYTES = 64 * 1024;

export function isAddress(value: string | undefined): value is Address {
  return typeof value === "string" && ADDRESS_PATTERN.test(value);
}

export function normalizeAddress(value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`Invalid EVM address: ${value}`);
  }

  return value.toLowerCase() as Address;
}

export function areAddressesEqual(left?: string, right?: string): boolean {
  if (!left || !right || !isAddress(left) || !isAddress(right)) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}

export function normalizeHexData(value: string | undefined): Hex {
  if (!value) {
    return "0x";
  }

  const normalized = value.toLowerCase();
  if (!HEX_PATTERN.test(normalized)) {
    throw new Error(`Invalid hex data: ${value}`);
  }

  const byteLength = hexByteLength(normalized);
  if (byteLength > MAX_CALLDATA_BYTES) {
    throw new Error(
      `Calldata exceeds ${MAX_CALLDATA_BYTES} byte limit: ${byteLength} bytes`
    );
  }

  return normalized as Hex;
}

export function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export function decodeAddressWord(word: string): Address {
  if (word.length !== 64) {
    throw new Error(`Invalid ABI address word length: ${word.length}`);
  }

  return normalizeAddress(`0x${word.slice(24)}`);
}

export function parseUint256Word(word: string): bigint {
  if (word.length !== 64 || !/^[a-fA-F0-9]+$/.test(word)) {
    throw new Error("Invalid ABI uint256 word");
  }

  return BigInt(`0x${word}`);
}

export function parseAmount(value: string | undefined): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  return BigInt(value);
}

export function validateAnalysisRequest(input: unknown): AnalysisRequest {
  const request = expectObject(input, "request");
  const intent = expectObject(request.intent, "intent");
  const transaction = expectObject(request.transaction, "transaction");
  const action = expectString(intent.action, "intent.action") as IntentAction;

  if (!INTENT_ACTIONS.has(action)) {
    throw new Error(`Unsupported intent action: ${action}`);
  }

  return {
    requestId: optionalString(request.requestId, "requestId"),
    intent: {
      intentId: optionalString(intent.intentId, "intent.intentId"),
      action,
      chainId: expectPositiveInteger(intent.chainId, "intent.chainId"),
      from: normalizeAddress(expectString(intent.from, "intent.from")),
      tokenAddress: optionalAddress(intent.tokenAddress, "intent.tokenAddress"),
      recipient: optionalAddress(intent.recipient, "intent.recipient"),
      spender: optionalAddress(intent.spender, "intent.spender"),
      amount: optionalDecimal(intent.amount, "intent.amount"),
      maxAmount: optionalDecimal(intent.maxAmount, "intent.maxAmount"),
      tokenId: optionalDecimal(intent.tokenId, "intent.tokenId"),
      allowNativeValue: optionalBoolean(
        intent.allowNativeValue,
        "intent.allowNativeValue"
      ),
      allowUnlimitedApproval: optionalBoolean(
        intent.allowUnlimitedApproval,
        "intent.allowUnlimitedApproval"
      ),
      allowOperatorApproval: optionalBoolean(
        intent.allowOperatorApproval,
        "intent.allowOperatorApproval"
      ),
      allowEip7702Authorization: optionalBoolean(
        intent.allowEip7702Authorization,
        "intent.allowEip7702Authorization"
      ),
      description: optionalDescription(intent.description, "intent.description")
    },
    transaction: validateUnsignedTransaction(transaction)
  };
}

function validateUnsignedTransaction(
  transaction: Record<string, unknown>
): UnsignedEvmTransaction {
  return {
    chainId: expectPositiveInteger(transaction.chainId, "transaction.chainId"),
    from: normalizeAddress(expectString(transaction.from, "transaction.from")),
    to: optionalAddress(transaction.to, "transaction.to"),
    value: optionalDecimal(transaction.value, "transaction.value"),
    data: normalizeHexData(expectString(transaction.data, "transaction.data")),
    type: optionalTransactionType(transaction.type, "transaction.type"),
    accessList: optionalUnknownArray(transaction.accessList, "transaction.accessList"),
    authorizationList: optionalUnknownArray(
      transaction.authorizationList,
      "transaction.authorizationList"
    ),
    blobVersionedHashes: optionalHexArray(
      transaction.blobVersionedHashes,
      "transaction.blobVersionedHashes"
    ),
    maxFeePerBlobGas: optionalDecimal(
      transaction.maxFeePerBlobGas,
      "transaction.maxFeePerBlobGas"
    )
  };
}

function expectObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${field} to be an object`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be a string`);
  }

  return value;
}

function expectPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`Expected ${field} to be a positive integer`);
  }

  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, field);
}

function optionalDescription(value: unknown, field: string): string | undefined {
  const description = optionalString(value, field);
  if (description === undefined) {
    return undefined;
  }

  return [...description]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
        ? " "
        : character;
    })
    .join("")
    .slice(0, 2_000);
}

function optionalAddress(value: unknown, field: string): Address | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeAddress(expectString(value, field));
}

function optionalDecimal(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const decimal = expectString(value, field);
  if (!DECIMAL_PATTERN.test(decimal)) {
    throw new Error(`Expected ${field} to be a decimal integer`);
  }

  return decimal;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Expected ${field} to be a boolean`);
  }

  return value;
}

function optionalTransactionType(
  value: unknown,
  field: string
): number | string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`Expected ${field} to be a number or string`);
  }

  return value;
}

function optionalUnknownArray(value: unknown, field: string): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Expected ${field} to be an array`);
  }

  return value;
}

function optionalHexArray(value: unknown, field: string): Hex[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Expected ${field} to be an array`);
  }

  return value.map((item, index) =>
    normalizeHexData(expectString(item, `${field}[${index}]`))
  );
}

function hexByteLength(value: string): number {
  return (value.length - 2) / 2;
}
