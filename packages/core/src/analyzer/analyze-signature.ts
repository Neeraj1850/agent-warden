import { decideVerdict } from "./risk-scorer.js";
import type { PolicyViolation } from "../types/policy.types.js";
import type {
  DecodedSignature,
  Eip712TypedData,
  SignatureAnalysisRequest,
  SignatureSecurityReport
} from "../types/signature.types.js";
import type { Address } from "../types/transaction.types.js";
import { hashObject } from "../utils/hashing.js";
import { areAddressesEqual, isAddress, normalizeAddress } from "../utils/validation.js";

const MAX_UINT256 = (1n << 256n) - 1n;
const PERMIT_PRIMARY_TYPES = new Set(["Permit", "PermitSingle", "PermitBatch"]);
const TRANSFER_AUTHORIZATION_TYPES = new Set([
  "TransferWithAuthorization",
  "ReceiveWithAuthorization"
]);
const SAFE_TRANSACTION_TYPES = new Set(["SafeTx", "SafeTransaction"]);

export function analyzeSignature(
  request: SignatureAnalysisRequest
): SignatureSecurityReport {
  const normalizedRequest = validateSignatureRequest(request);
  const decodedSignature = decodeSignature(normalizedRequest);
  const policyViolations = evaluateSignaturePolicies(normalizedRequest, decodedSignature);
  const reportWithoutHash = {
    requestId: normalizedRequest.requestId,
    verdict: decideVerdict(policyViolations),
    riskScore: scoreSignatureRisk(decodedSignature, policyViolations),
    actionType: decodedSignature.actionType,
    decodedSignature,
    policyViolations,
    saferAlternative: saferAlternative(policyViolations)
  };

  return {
    ...reportWithoutHash,
    reportHash: hashObject({
      intent: normalizedRequest.intent,
      payload: normalizedRequest.payload,
      report: reportWithoutHash
    })
  };
}

export function validateSignatureRequest(
  request: SignatureAnalysisRequest
): SignatureAnalysisRequest {
  if (!request || typeof request !== "object") {
    throw new Error("Expected signature request to be an object");
  }

  if (!request.intent || typeof request.intent !== "object") {
    throw new Error("Expected signature intent to be an object");
  }

  if (!request.payload || typeof request.payload !== "object") {
    throw new Error("Expected signature payload to be an object");
  }

  return {
    requestId: typeof request.requestId === "string" ? request.requestId : undefined,
    intent: {
      ...request.intent,
      from: normalizeAddress(request.intent.from),
      verifyingContract: request.intent.verifyingContract
        ? normalizeAddress(request.intent.verifyingContract)
        : undefined,
      spender: request.intent.spender
        ? normalizeAddress(request.intent.spender)
        : undefined
    },
    payload: request.payload
  };
}

function decodeSignature(request: SignatureAnalysisRequest): DecodedSignature {
  if (request.payload.kind === "eip712_typed_data" && request.payload.typedData) {
    return decodeTypedData(request.payload.typedData);
  }

  if (request.payload.kind === "personal_sign") {
    return decodePersonalSign(request.payload.message);
  }

  if (request.payload.kind === "eth_sign") {
    return {
      kind: "eth_sign",
      actionType: "unknown_signature",
      warnings: ["eth_sign is opaque blind-signing data."]
    };
  }

  return {
    kind: request.payload.kind,
    actionType: "unknown_signature",
    warnings: ["Unsupported signature payload kind."]
  };
}

function decodeTypedData(typedData: Eip712TypedData): DecodedSignature {
  const primaryType = typedData.primaryType;
  const message = typedData.message;
  const domainChainId = parseOptionalNumber(typedData.domain?.chainId);
  const verifyingContract = typedData.domain?.verifyingContract
    ? normalizeAddress(typedData.domain.verifyingContract)
    : undefined;

  if (PERMIT_PRIMARY_TYPES.has(primaryType)) {
    return {
      kind: "eip712_typed_data",
      actionType: primaryType === "Permit" ? "permit_signature" : "permit2_signature",
      primaryType,
      domainName: typedData.domain?.name,
      chainId: domainChainId,
      verifyingContract,
      owner: readAddress(message, ["owner", "holder"]),
      spender: readAddress(message, ["spender", "operator"]),
      value: readDecimal(message, ["value", "amount", "permitted.amount"]),
      deadline: readDecimal(message, ["deadline", "sigDeadline"]),
      warnings: ["Permit-style typed data can authorize token spending off-chain."]
    };
  }

  if (primaryType.toLowerCase().includes("permit")) {
    return {
      kind: "eip712_typed_data",
      actionType: "permit2_signature",
      primaryType,
      domainName: typedData.domain?.name,
      chainId: domainChainId,
      verifyingContract,
      owner: readAddress(message, ["owner", "holder"]),
      spender: readAddress(message, ["spender", "operator"]),
      value: readDecimal(message, ["value", "amount", "permitted.amount"]),
      deadline: readDecimal(message, ["deadline", "sigDeadline"]),
      warnings: ["Permit-like typed data detected from primaryType."]
    };
  }

  if (TRANSFER_AUTHORIZATION_TYPES.has(primaryType)) {
    return {
      kind: "eip712_typed_data",
      actionType: "transfer_authorization_signature",
      primaryType,
      domainName: typedData.domain?.name,
      chainId: domainChainId,
      verifyingContract,
      owner: readAddress(message, ["from", "owner"]),
      to: readAddress(message, ["to", "recipient"]),
      value: readDecimal(message, ["value", "amount"]),
      deadline: readDecimal(message, ["validBefore", "deadline"]),
      warnings: ["Transfer authorization typed data can move funds off-chain."]
    };
  }

  if (SAFE_TRANSACTION_TYPES.has(primaryType)) {
    return {
      kind: "eip712_typed_data",
      actionType: "safe_transaction_signature",
      primaryType,
      domainName: typedData.domain?.name,
      chainId: domainChainId,
      verifyingContract,
      to: readAddress(message, ["to"]),
      value: readDecimal(message, ["value"]),
      warnings: ["Safe transaction typed data can authorize smart account execution."]
    };
  }

  if (primaryType.toLowerCase().includes("authorization")) {
    return {
      kind: "eip712_typed_data",
      actionType: "authorization_signature",
      primaryType,
      domainName: typedData.domain?.name,
      chainId: domainChainId,
      verifyingContract,
      owner: readAddress(message, ["authority", "owner", "from"]),
      warnings: ["Authorization typed data can delegate account or token authority."]
    };
  }

  if (
    primaryType.toLowerCase().includes("login") ||
    primaryType.toLowerCase().includes("authentication")
  ) {
    return {
      kind: "eip712_typed_data",
      actionType: "login_signature",
      primaryType,
      domainName: typedData.domain?.name,
      chainId: domainChainId,
      verifyingContract,
      warnings: []
    };
  }

  return {
    kind: "eip712_typed_data",
    actionType: "unknown_signature",
    primaryType,
    domainName: typedData.domain?.name,
    chainId: domainChainId,
    verifyingContract,
    warnings: ["Unknown EIP-712 primaryType."]
  };
}

function decodePersonalSign(message: string | undefined): DecodedSignature {
  const normalizedMessage = message ?? "";
  const lowerMessage = normalizedMessage.toLowerCase();
  const looksLikeLogin =
    lowerMessage.includes("sign in") ||
    lowerMessage.includes("login") ||
    lowerMessage.includes("authenticate");

  return {
    kind: "personal_sign",
    actionType: looksLikeLogin ? "login_signature" : "unknown_signature",
    warnings: looksLikeLogin
      ? []
      : ["personal_sign message is not a recognized login/authentication message."]
  };
}

function evaluateSignaturePolicies(
  request: SignatureAnalysisRequest,
  decoded: DecodedSignature
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (decoded.chainId !== undefined && decoded.chainId !== request.intent.chainId) {
    violations.push({
      code: "SIGNATURE_CHAIN_MISMATCH",
      severity: "critical",
      message: "Signature domain chain does not match the declared intent chain.",
      expected: String(request.intent.chainId),
      actual: String(decoded.chainId)
    });
  }

  if (
    request.intent.verifyingContract &&
    decoded.verifyingContract &&
    !areAddressesEqual(request.intent.verifyingContract, decoded.verifyingContract)
  ) {
    violations.push({
      code: "SIGNATURE_VERIFYING_CONTRACT_MISMATCH",
      severity: "critical",
      message:
        "Signature verifying contract does not match the declared intent contract.",
      expected: request.intent.verifyingContract,
      actual: decoded.verifyingContract
    });
  }

  if (decoded.owner && !areAddressesEqual(request.intent.from, decoded.owner)) {
    violations.push({
      code: "SIGNATURE_OWNER_MISMATCH",
      severity: "critical",
      message: "Signature owner does not match the declared signer.",
      expected: request.intent.from,
      actual: decoded.owner
    });
  }

  if (
    request.intent.spender &&
    decoded.spender &&
    !areAddressesEqual(request.intent.spender, decoded.spender)
  ) {
    violations.push({
      code: "SIGNATURE_SPENDER_MISMATCH",
      severity: "critical",
      message: "Signature spender does not match the declared intent spender.",
      expected: request.intent.spender,
      actual: decoded.spender
    });
  }

  if (
    decoded.actionType === "permit_signature" ||
    decoded.actionType === "permit2_signature"
  ) {
    violations.push({
      code: "PERMIT_TYPED_DATA_SIGNATURE",
      severity: "critical",
      message:
        "Permit-style typed data can authorize token spending without an onchain approval transaction.",
      expected: "bounded, explicit permit review",
      actual: decoded.primaryType
    });
  }

  if (decoded.actionType === "transfer_authorization_signature") {
    violations.push({
      code: "TRANSFER_AUTHORIZATION_SIGNATURE",
      severity: "critical",
      message:
        "Transfer authorization typed data can authorize token movement without a normal transaction prepared by the agent.",
      expected: "explicit transfer authorization review",
      actual: decoded.primaryType
    });
  }

  if (decoded.actionType === "safe_transaction_signature") {
    violations.push({
      code: "SAFE_TRANSACTION_SIGNATURE",
      severity: "high",
      message:
        "Safe transaction typed data can authorize smart account execution and requires transaction-level decoding.",
      expected: "decoded Safe transaction execution payload",
      actual: decoded.primaryType
    });
  }

  if (decoded.actionType === "authorization_signature") {
    violations.push({
      code: "AUTHORIZATION_SIGNATURE_REQUIRES_REVIEW",
      severity: "critical",
      message: "Authorization typed data can delegate authority and requires review.",
      expected: "no authority delegation unless explicitly modeled",
      actual: decoded.primaryType
    });
  }

  if (decoded.value && BigInt(decoded.value) === MAX_UINT256) {
    violations.push({
      code: "UNLIMITED_SIGNATURE_ALLOWANCE",
      severity: "critical",
      message: "Signature authorizes an unlimited token allowance.",
      expected: "bounded allowance",
      actual: decoded.value
    });
  }

  if (decoded.kind === "eth_sign") {
    violations.push({
      code: "BLIND_ETH_SIGN",
      severity: "critical",
      message: "eth_sign payloads are opaque and must not be approved automatically."
    });
  }

  if (decoded.actionType === "unknown_signature" && decoded.kind !== "eth_sign") {
    violations.push({
      code: "UNKNOWN_SIGNATURE_PAYLOAD",
      severity: "high",
      message: "Signature payload could not be classified as a safe known action.",
      actual: decoded.primaryType ?? decoded.kind
    });
  }

  return violations;
}

function scoreSignatureRisk(
  decoded: DecodedSignature,
  violations: PolicyViolation[]
): number {
  const baseRisk = decoded.actionType === "login_signature" ? 5 : 35;
  const violationRisk = violations.reduce((total, violation) => {
    if (violation.severity === "critical") {
      return total + 80;
    }

    if (violation.severity === "high") {
      return total + 45;
    }

    if (violation.severity === "medium") {
      return total + 20;
    }

    return total + 5;
  }, 0);

  return Math.min(100, baseRisk + violationRisk);
}

function saferAlternative(violations: PolicyViolation[]): string | undefined {
  if (
    violations.some((violation) =>
      ["PERMIT_TYPED_DATA_SIGNATURE", "UNLIMITED_SIGNATURE_ALLOWANCE"].includes(
        violation.code
      )
    )
  ) {
    return "Do not sign permit typed data unless spender, token, amount, nonce, deadline, and verifying contract are independently bounded.";
  }

  if (
    violations.some((violation) =>
      [
        "TRANSFER_AUTHORIZATION_SIGNATURE",
        "SAFE_TRANSACTION_SIGNATURE",
        "AUTHORIZATION_SIGNATURE_REQUIRES_REVIEW"
      ].includes(violation.code)
    )
  ) {
    return "Decode the typed-data execution target and require explicit bounded intent before signing.";
  }

  if (violations.some((violation) => violation.code === "BLIND_ETH_SIGN")) {
    return "Reject blind eth_sign requests and require structured EIP-712 typed data with an explicit intent.";
  }

  if (violations.some((violation) => violation.code === "UNKNOWN_SIGNATURE_PAYLOAD")) {
    return "Route the signature request to a typed-data decoder and reject unknown primary types by default.";
  }

  return undefined;
}

function readAddress(
  message: Record<string, unknown>,
  paths: string[]
): Address | undefined {
  for (const path of paths) {
    const value = readPath(message, path);
    if (typeof value === "string" && isAddress(value)) {
      return normalizeAddress(value);
    }
  }

  return undefined;
}

function readDecimal(
  message: Record<string, unknown>,
  paths: string[]
): string | undefined {
  for (const path of paths) {
    const value = readPath(message, path);
    if (typeof value === "bigint") {
      return value.toString();
    }

    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      return String(value);
    }

    if (typeof value === "string" && /^\d+$/.test(value)) {
      return value;
    }
  }

  return undefined;
}

function readPath(message: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, message);
}

function parseOptionalNumber(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return undefined;
}
