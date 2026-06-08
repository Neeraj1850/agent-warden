import { Contract, FetchRequest, JsonRpcProvider, type ContractRunner } from "ethers";
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
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)"
];

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)"
];

export interface EthersLikeProvider {
  getBalance(address: Address): Promise<bigint>;
  getCode(address: Address): Promise<string>;
  getTransactionCount(address: Address): Promise<number>;
}

export interface EthersLikeContract {
  balanceOf?(...args: unknown[]): Promise<unknown>;
  allowance?(...args: unknown[]): Promise<unknown>;
  symbol?(): Promise<unknown>;
  decimals?(): Promise<unknown>;
  ownerOf?(tokenId: bigint): Promise<unknown>;
  getApproved?(tokenId: bigint): Promise<unknown>;
  isApprovedForAll?(owner: Address, operator: Address): Promise<unknown>;
}

export type EthersContractFactory = (
  address: Address,
  abi: readonly string[],
  provider: EthersLikeProvider
) => EthersLikeContract;

export interface EthersChainStateProviderOptions {
  rpcUrl?: string;
  timeoutMs?: number;
  provider?: EthersLikeProvider;
  contractFactory?: EthersContractFactory;
}

export class EthersChainStateProvider implements ChainStateProvider {
  private readonly provider: EthersLikeProvider;
  private readonly contractFactory: EthersContractFactory;

  constructor(options: EthersChainStateProviderOptions) {
    this.provider =
      options.provider ?? createJsonRpcProvider(options.rpcUrl, options.timeoutMs);
    this.contractFactory =
      options.contractFactory ??
      ((address, abi, provider) =>
        new Contract(
          address,
          abi,
          provider as unknown as ContractRunner
        ) as unknown as EthersLikeContract);
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
      () => this.provider.getBalance(request.transaction.from),
      errors
    );
    snapshot.account.nonce = await this.readNumber(
      "nonce",
      request.transaction.from,
      () => this.provider.getTransactionCount(request.transaction.from),
      errors
    );

    if (request.transaction.to) {
      const bytecode = await this.readHex(
        "bytecode",
        request.transaction.to,
        () => this.provider.getCode(request.transaction.to!),
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
    const contract = this.contractFactory(tokenAddress, ERC20_ABI, this.provider);
    const state: Erc20State = {
      tokenAddress,
      owner: request.transaction.from,
      spender: action.spender
    };

    state.balance = await this.readContractString(
      "erc20.balanceOf",
      tokenAddress,
      () => callContract(contract.balanceOf, request.transaction.from),
      errors
    );

    if (action.spender) {
      state.allowance = await this.readContractString(
        "erc20.allowance",
        tokenAddress,
        () => callContract(contract.allowance, request.transaction.from, action.spender!),
        errors
      );
    }

    state.symbol = await this.readOptionalString(
      () => callContract(contract.symbol),
      "erc20.symbol"
    );
    state.decimals = await this.readOptionalNumber(
      () => callContract(contract.decimals),
      "erc20.decimals"
    );

    return state;
  }

  private async readErc721State(
    request: AnalysisRequest,
    action: DecodedAction,
    errors: StateLookupError[]
  ): Promise<Erc721State> {
    const tokenAddress = action.tokenAddress ?? action.contractAddress!;
    const contract = this.contractFactory(tokenAddress, ERC721_ABI, this.provider);
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
        () => callContract(contract.ownerOf, tokenId),
        errors
      );
      state.approved = await this.readAddress(
        "erc721.getApproved",
        tokenAddress,
        () => callContract(contract.getApproved, tokenId),
        errors
      );
    }

    if (action.operator) {
      state.isApprovedForAll = await this.readBoolean(
        "erc721.isApprovedForAll",
        tokenAddress,
        () =>
          callContract(
            contract.isApprovedForAll,
            request.transaction.from,
            action.operator!
          ),
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
    const contract = this.contractFactory(tokenAddress, ERC1155_ABI, this.provider);
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
          callContract(
            contract.balanceOf,
            request.transaction.from,
            BigInt(action.tokenId!)
          ),
        errors
      );
    }

    if (action.operator) {
      state.isApprovedForAll = await this.readBoolean(
        "erc1155.isApprovedForAll",
        tokenAddress,
        () =>
          callContract(
            contract.isApprovedForAll,
            request.transaction.from,
            action.operator!
          ),
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

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (typeof value === "number") {
      return BigInt(value).toString();
    }

    if (typeof value === "string" && /^\d+$/.test(value)) {
      return value;
    }

    return undefined;
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
    read: () => Promise<unknown>,
    _operation: string
  ): Promise<string | undefined> {
    try {
      const value = await read();
      return typeof value === "string" ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private async readOptionalNumber(
    read: () => Promise<unknown>,
    _operation: string
  ): Promise<number | undefined> {
    try {
      const value = await read();

      if (typeof value === "number") {
        return value;
      }

      if (typeof value === "bigint") {
        return Number(value);
      }

      return undefined;
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
    read: () => Promise<string>,
    errors: StateLookupError[]
  ): Promise<Hex | undefined> {
    const value = await this.read(operation, subject, read, errors);
    return typeof value === "string" ? (value as Hex) : undefined;
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

function callContract(method: unknown, ...args: unknown[]): Promise<unknown> {
  if (typeof method !== "function") {
    return Promise.reject(new Error("Contract method is unavailable."));
  }

  return (method as (...methodArgs: unknown[]) => Promise<unknown>)(...args);
}

function createJsonRpcProvider(
  rpcUrl: string | undefined,
  timeoutMs: number | undefined
): JsonRpcProvider {
  if (!rpcUrl) {
    throw new Error("EthersChainStateProvider requires rpcUrl or provider.");
  }

  const request = new FetchRequest(rpcUrl);
  request.timeout = timeoutMs ?? 3_000;
  return new JsonRpcProvider(request);
}
