import { z } from "zod";
import { MAX_CALLDATA_BYTES } from "@agent-warden/core";

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected an EVM address");
export const hexSchema = z
  .string()
  .regex(/^0x([a-fA-F0-9]{2})*$/, "Expected 0x-prefixed hex data")
  .refine(
    (value) => (value.length - 2) / 2 <= MAX_CALLDATA_BYTES,
    `Calldata exceeds ${MAX_CALLDATA_BYTES} byte limit`
  );
export const decimalSchema = z.string().regex(/^\d+$/, "Expected a decimal integer");

export const intentSchema = z.object({
  intentId: z.string().optional(),
  action: z.enum([
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
  ]),
  chainId: z.number().int().positive(),
  from: addressSchema,
  tokenAddress: addressSchema.optional(),
  recipient: addressSchema.optional(),
  spender: addressSchema.optional(),
  amount: decimalSchema.optional(),
  maxAmount: decimalSchema.optional(),
  tokenId: decimalSchema.optional(),
  allowNativeValue: z.boolean().optional(),
  allowUnlimitedApproval: z.boolean().optional(),
  allowOperatorApproval: z.boolean().optional(),
  allowEip7702Authorization: z.boolean().optional(),
  expectedOutcome: z
    .object({
      recipients: z.array(addressSchema).optional(),
      tokenOutflows: z
        .array(
          z.object({
            assetStandard: z
              .enum(["native", "erc20", "erc721", "erc1155", "unknown"])
              .optional(),
            tokenAddress: addressSchema.optional(),
            recipient: addressSchema.optional(),
            amount: decimalSchema.optional(),
            maxAmount: decimalSchema.optional(),
            tokenId: decimalSchema.optional()
          })
        )
        .optional(),
      nftTransfers: z
        .array(
          z.object({
            standard: z.enum(["erc721", "erc1155"]).optional(),
            tokenAddress: addressSchema.optional(),
            recipient: addressSchema.optional(),
            tokenId: decimalSchema.optional(),
            amount: decimalSchema.optional()
          })
        )
        .optional(),
      approvals: z
        .array(
          z.object({
            standard: z.enum(["erc20", "erc721", "erc1155", "unknown"]).optional(),
            tokenAddress: addressSchema.optional(),
            spender: addressSchema.optional(),
            operator: addressSchema.optional(),
            amount: decimalSchema.optional(),
            maxAmount: decimalSchema.optional(),
            tokenId: decimalSchema.optional(),
            approved: z.boolean().optional()
          })
        )
        .optional(),
      allowedSpenders: z.array(addressSchema).optional(),
      allowedOperators: z.array(addressSchema).optional(),
      maxNativeValue: decimalSchema.optional(),
      maxTokenAmounts: z
        .array(z.object({ tokenAddress: addressSchema, maxAmount: decimalSchema }))
        .optional(),
      allowUnknownLogs: z.boolean().optional()
    })
    .optional(),
  description: z.string().optional()
});

export const policyProfileSchema = z.object({
  profileId: z.string(),
  name: z.string(),
  mode: z.enum(["strict", "balanced", "permissive-testnet"]),
  allowedChains: z.array(z.number().int().positive()).optional(),
  allowedActions: z.array(intentSchema.shape.action).optional(),
  allowedRecipients: z.array(addressSchema).optional(),
  allowedTokens: z.array(addressSchema).optional(),
  allowedSpenders: z.array(addressSchema).optional(),
  allowedOperators: z.array(addressSchema).optional(),
  allowedRouters: z.array(addressSchema).optional(),
  maxNativeValue: decimalSchema.optional(),
  maxTokenAmounts: z
    .array(z.object({ tokenAddress: addressSchema, maxAmount: decimalSchema }))
    .optional(),
  blockApprovals: z.boolean().optional(),
  blockOperatorApprovals: z.boolean().optional(),
  blockContractDeployments: z.boolean().optional(),
  blockUnknownContracts: z.boolean().optional(),
  requireSimulation: z.boolean().optional(),
  requireExpectedOutcome: z.boolean().optional(),
  metadata: z.record(z.string()).optional()
});

export const transactionSchema = z.object({
  chainId: z.number().int().positive(),
  from: addressSchema,
  to: addressSchema.optional(),
  value: decimalSchema.optional(),
  data: hexSchema,
  type: z.union([z.number(), z.string()]).optional(),
  accessList: z.array(z.unknown()).optional(),
  authorizationList: z.array(z.unknown()).optional(),
  blobVersionedHashes: z.array(hexSchema).optional(),
  maxFeePerBlobGas: decimalSchema.optional()
});

export const analyzeTransactionInputSchema = {
  requestId: z.string().optional(),
  profileId: z.string().optional(),
  policyProfile: policyProfileSchema.optional(),
  intent: intentSchema,
  transaction: transactionSchema
};

export const getPolicyProfileInputSchema = {
  profileId: z.string()
};

export const signatureIntentSchema = z.object({
  action: z.enum(["login", "permit", "authorization", "unknown"]),
  chainId: z.number().int().positive(),
  from: addressSchema,
  verifyingContract: addressSchema.optional(),
  spender: addressSchema.optional(),
  maxAmount: decimalSchema.optional(),
  description: z.string().optional()
});

export const typedDataSchema = z.object({
  domain: z
    .object({
      name: z.string().optional(),
      version: z.string().optional(),
      chainId: z.union([z.number().int().positive(), decimalSchema]).optional(),
      verifyingContract: addressSchema.optional()
    })
    .optional(),
  primaryType: z.string(),
  message: z.record(z.unknown())
});

export const signaturePayloadSchema = z.object({
  kind: z.enum(["eip712_typed_data", "personal_sign", "eth_sign", "unknown"]),
  typedData: typedDataSchema.optional(),
  message: z.string().optional()
});

export const analyzeSignatureInputSchema = {
  requestId: z.string().optional(),
  intent: signatureIntentSchema,
  payload: signaturePayloadSchema
};

export const explainReportInputSchema = {
  report: z
    .object({
      verdict: z.enum(["ALLOW", "WARN", "BLOCK"]),
      riskScore: z.number().int().min(0).max(100),
      reportHash: z.string().regex(/^0x[a-f0-9]{64}$/),
      summary: z.string(),
      recommendedAction: z.string(),
      findings: z.array(z.unknown()),
      policyViolations: z.array(z.unknown()),
      simulationResult: z.object({}).passthrough()
    })
    .passthrough()
};

export const verifyReportInputSchema = {
  kind: z.enum(["transaction", "signature"]),
  request: z.record(z.unknown()),
  report: z.record(z.unknown())
};

export const getReportInputSchema = {
  reportHash: z.string().regex(/^0x[a-f0-9]{64}$/)
};
