import { createPublicClient, http, type Abi, type PublicClient } from "viem";
import type { ChainStateProvider } from "./chain-state-provider.js";
import type { AnalysisRequest, SecurityReport } from "../types/report.types.js";
import type {
  ChainStateSnapshot,
  Erc1155State,
  Erc20State,
  Erc721State,
  StateLookupError
} from "../types/state.types.js";
import type { Address, DecodedAction, Hex } from "../types/transaction.types.js";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "allowance", type: "uint256" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "symbol", type: "string" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }]
  }
] as const satisfies Abi;

const ERC721_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }]
  },
  {
    type: "function",
    name: "getApproved",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "approved", type: "address" }]
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" }
    ],
    outputs: [{ name: "approved", type: "bool" }]
  }
] as const satisfies Abi;

const ERC1155_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
    outputs: [{ name: "balance", type: "uint256" }]
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" }
    ],
    outputs: [{ name: "approved", type: "bool" }]
  }
] as const satisfies Abi;

export interface ViemChainStateProviderOptions {
  rpcUrl: string;
  timeoutMs?: number;
}

export class ViemChainStateProvider implements ChainStateProvider {
  private readonly client: PublicClient;

  constructor(options: ViemChainStateProviderOptions) {
    this.client = createPublicClient({
      transport: http(options.rpcUrl, {
        timeout: options.timeoutMs ?? 3_000
      })
    });
  }

  async getSnapshot(
    request: AnalysisRequest,
    report: SecurityReport
  ): Promise<ChainStateSnapshot> {
    const errors: StateLookupError[] = [];
    const snapshot: ChainStateSnapshot = {
      chainId: request.transaction.chainId,
      blockTag: "latest",
      account: {
        address: request.transaction.from
      },
      target: request.transaction.to
        ? {
            address: request.transaction.to
          }
        : undefined,
      erc20: [],
      erc721: [],
      erc1155: [],
      lookupErrors: errors
    };

    snapshot.account.nativeBalance = await this.readString(
      "nativeBalance",
      request.transaction.from,
      () => this.client.getBalance({ address: request.transaction.from }),
      errors
    );
    snapshot.account.nonce = await this.readNumber(
      "nonce",
      request.transaction.from,
      () => this.client.getTransactionCount({ address: request.transaction.from }),
      errors
    );

    if (request.transaction.to) {
      const bytecode = await this.readHex(
        "bytecode",
        request.transaction.to,
        () => this.client.getBytecode({ address: request.transaction.to! }),
        errors
      );
      snapshot.target = {
        address: request.transaction.to,
        bytecode: bytecode ?? "0x",
        isContract: Boolean(bytecode && bytecode !== "0x")
      };
    }

    for (const action of report.decodedActions) {
      if (action.assetStandard === "erc20") {
        snapshot.erc20.push(await this.readErc20State(request, action, errors));
      }

      if (action.assetStandard === "erc721") {
        snapshot.erc721.push(await this.readErc721State(request, action, errors));
      }

      if (action.assetStandard === "erc1155") {
        snapshot.erc1155.push(await this.readErc1155State(request, action, errors));
      }
    }

    return snapshot;
  }

  private async readErc20State(
    request: AnalysisRequest,
    action: DecodedAction,
    errors: StateLookupError[]
  ): Promise<Erc20State> {
    const tokenAddress = action.tokenAddress ?? action.contractAddress!;
    const state: Erc20State = {
      tokenAddress,
      owner: request.transaction.from,
      spender: action.spender
    };

    state.balance = await this.readContractString(
      "erc20.balanceOf",
      tokenAddress,
      () =>
        this.client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [request.transaction.from]
        }),
      errors
    );

    if (action.spender) {
      state.allowance = await this.readContractString(
        "erc20.allowance",
        tokenAddress,
        () =>
          this.client.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [request.transaction.from, action.spender!]
          }),
        errors
      );
    }

    state.symbol = await this.readOptionalString(
      "erc20.symbol",
      tokenAddress,
      () =>
        this.client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "symbol"
        }),
      errors
    );
    state.decimals = await this.readNumber(
      "erc20.decimals",
      tokenAddress,
      () =>
        this.client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "decimals"
        }),
      errors
    );

    return state;
  }

  private async readErc721State(
    request: AnalysisRequest,
    action: DecodedAction,
    errors: StateLookupError[]
  ): Promise<Erc721State> {
    const tokenAddress = action.tokenAddress ?? action.contractAddress!;
    const state: Erc721State = {
      tokenAddress,
      owner: request.transaction.from,
      tokenId: action.tokenId,
      operator: action.operator
    };

    if (action.tokenId) {
      const tokenId = BigInt(action.tokenId);
      state.ownerOf = await this.readAddress(
        "erc721.ownerOf",
        tokenAddress,
        () =>
          this.client.readContract({
            address: tokenAddress,
            abi: ERC721_ABI,
            functionName: "ownerOf",
            args: [tokenId]
          }),
        errors
      );
      state.approved = await this.readAddress(
        "erc721.getApproved",
        tokenAddress,
        () =>
          this.client.readContract({
            address: tokenAddress,
            abi: ERC721_ABI,
            functionName: "getApproved",
            args: [tokenId]
          }),
        errors
      );
    }

    if (action.operator) {
      state.isApprovedForAll = await this.readBoolean(
        "erc721.isApprovedForAll",
        tokenAddress,
        () =>
          this.client.readContract({
            address: tokenAddress,
            abi: ERC721_ABI,
            functionName: "isApprovedForAll",
            args: [request.transaction.from, action.operator!]
          }),
        errors
      );
    }

    return state;
  }

  private async readErc1155State(
    request: AnalysisRequest,
    action: DecodedAction,
    errors: StateLookupError[]
  ): Promise<Erc1155State> {
    const tokenAddress = action.tokenAddress ?? action.contractAddress!;
    const state: Erc1155State = {
      tokenAddress,
      owner: request.transaction.from,
      tokenId: action.tokenId,
      operator: action.operator
    };

    if (action.tokenId) {
      state.balance = await this.readContractString(
        "erc1155.balanceOf",
        tokenAddress,
        () =>
          this.client.readContract({
            address: tokenAddress,
            abi: ERC1155_ABI,
            functionName: "balanceOf",
            args: [request.transaction.from, BigInt(action.tokenId!)]
          }),
        errors
      );
    }

    if (action.operator) {
      state.isApprovedForAll = await this.readBoolean(
        "erc1155.isApprovedForAll",
        tokenAddress,
        () =>
          this.client.readContract({
            address: tokenAddress,
            abi: ERC1155_ABI,
            functionName: "isApprovedForAll",
            args: [request.transaction.from, action.operator!]
          }),
        errors
      );
    }

    return state;
  }

  private async readString(
    operation: string,
    subject: string,
    read: () => Promise<bigint>,
    errors: StateLookupError[]
  ): Promise<string | undefined> {
    const value = await this.read(operation, subject, read, errors);
    return value?.toString();
  }

  private async readContractString(
    operation: string,
    subject: string,
    read: () => Promise<unknown>,
    errors: StateLookupError[]
  ): Promise<string | undefined> {
    const value = await this.read(operation, subject, read, errors);
    return typeof value === "bigint" ? value.toString() : undefined;
  }

  private async readNumber(
    operation: string,
    subject: string,
    read: () => Promise<unknown>,
    errors: StateLookupError[]
  ): Promise<number | undefined> {
    const value = await this.read(operation, subject, read, errors);
    return typeof value === "number" ? value : undefined;
  }

  private async readOptionalString(
    operation: string,
    subject: string,
    read: () => Promise<unknown>,
    _errors: StateLookupError[]
  ): Promise<string | undefined> {
    try {
      const value = await read();
      return typeof value === "string" ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private async readAddress(
    operation: string,
    subject: string,
    read: () => Promise<unknown>,
    errors: StateLookupError[]
  ): Promise<Address | undefined> {
    const value = await this.read(operation, subject, read, errors);
    return typeof value === "string" ? (value.toLowerCase() as Address) : undefined;
  }

  private async readBoolean(
    operation: string,
    subject: string,
    read: () => Promise<unknown>,
    errors: StateLookupError[]
  ): Promise<boolean | undefined> {
    const value = await this.read(operation, subject, read, errors);
    return typeof value === "boolean" ? value : undefined;
  }

  private async readHex(
    operation: string,
    subject: string,
    read: () => Promise<Hex | undefined>,
    errors: StateLookupError[]
  ): Promise<Hex | undefined> {
    return this.read(operation, subject, read, errors);
  }

  private async read<T>(
    operation: string,
    subject: string,
    read: () => Promise<T>,
    errors: StateLookupError[]
  ): Promise<T | undefined> {
    try {
      return await read();
    } catch (error) {
      errors.push({
        operation,
        subject,
        message: error instanceof Error ? error.message : "Unknown RPC error"
      });
      return undefined;
    }
  }
}
