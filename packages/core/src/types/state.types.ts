import type { Address, Hex } from "./transaction.types.js";

export interface ChainStateSnapshot {
  chainId: number;
  blockTag: "latest";
  account: {
    address: Address;
    nativeBalance?: string;
    nonce?: number;
  };
  target?: {
    address: Address;
    bytecode?: Hex;
    isContract?: boolean;
  };
  erc20: Erc20State[];
  erc721: Erc721State[];
  erc1155: Erc1155State[];
  lookupErrors: StateLookupError[];
}

export interface Erc20State {
  tokenAddress: Address;
  owner: Address;
  balance?: string;
  spender?: Address;
  allowance?: string;
  symbol?: string;
  decimals?: number;
}

export interface Erc721State {
  tokenAddress: Address;
  owner: Address;
  tokenId?: string;
  ownerOf?: Address;
  approved?: Address;
  operator?: Address;
  isApprovedForAll?: boolean;
}

export interface Erc1155State {
  tokenAddress: Address;
  owner: Address;
  tokenId?: string;
  balance?: string;
  operator?: Address;
  isApprovedForAll?: boolean;
}

export interface StateLookupError {
  subject: string;
  operation: string;
  message: string;
}
