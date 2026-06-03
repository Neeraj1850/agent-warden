import { z } from "zod";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected an EVM address");
const hexSchema = z
  .string()
  .regex(/^0x([a-fA-F0-9]{2})*$/, "Expected 0x-prefixed hex data");
const decimalSchema = z.string().regex(/^\d+$/, "Expected a decimal integer");

export const analyzeTransactionInputSchema = {
  requestId: z.string().optional(),
  intent: z.object({
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
        description: z.string().optional()
      }),
  transaction: z.object({
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
  })
};
