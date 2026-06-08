import type {
  AnalysisRequest,
  ChainStateSnapshot,
  SignatureAnalysisRequest,
  Verdict
} from "@agent-warden/core";

type Address = `0x${string}`;

export interface DemoPayload {
  id: string;
  title: string;
  source: "AgentKit" | "GOAT" | "Eliza" | "Generic";
  kind?: "transaction" | "signature";
  expectedVerdict: Verdict;
  request: AnalysisRequest | SignatureAnalysisRequest;
  stateSnapshot?: ChainStateSnapshot;
}

const CHAIN_ID = 11155111;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const OTHER = "0x4444444444444444444444444444444444444444" as Address;
const SPENDER = "0x5555555555555555555555555555555555555555" as Address;
const ROUTER = "0x6666666666666666666666666666666666666666" as Address;
const MAX_UINT256 = (1n << 256n) - 1n;

export const demoPayloads: DemoPayload[] = [
  {
    id: "agentkit-safe-erc20-transfer",
    title: "AgentKit-style safe ERC-20 transfer",
    source: "AgentKit",
    expectedVerdict: "ALLOW",
    request: {
      requestId: "agentkit-safe-erc20-transfer",
      intent: {
        action: "token_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1000000",
        description: "AgentKit benchmark: transfer test USDC."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1_000_000n)
      }
    }
  },
  {
    id: "goat-unlimited-erc20-approval",
    title: "GOAT-style DeFi approval with unlimited allowance",
    source: "GOAT",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "goat-unlimited-erc20-approval",
      intent: {
        action: "approval",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER,
        maxAmount: MAX_UINT256.toString(),
        description: "GOAT benchmark: approve router before DeFi action."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Approve(SPENDER, MAX_UINT256)
      }
    }
  },
  {
    id: "eliza-erc721-set-approval-for-all",
    title: "Eliza-style NFT collection-wide approval",
    source: "Eliza",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "eliza-erc721-set-approval-for-all",
      intent: {
        action: "nft_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER,
        description: "Eliza benchmark: NFT action attempts operator approval."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeSetApprovalForAll(SPENDER, true)
      }
    }
  },
  {
    id: "erc1155-set-approval-for-all",
    title: "ERC-1155 collection-wide operator approval",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "erc1155-set-approval-for-all",
      intent: {
        action: "approval",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER,
        description: "Generic benchmark: ERC-1155 operator approval."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeSetApprovalForAll(SPENDER, true)
      }
    }
  },
  {
    id: "multicall-hidden-approval",
    title: "Multicall containing hidden approval selector",
    source: "GOAT",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "multicall-hidden-approval",
      intent: {
        action: "multicall",
        chainId: CHAIN_ID,
        from: FROM,
        description: "GOAT benchmark: plugin-style multicall bundle."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: ROUTER,
        value: "0",
        data: `0xac9650d8${"0".repeat(64)}095ea7b3${"0".repeat(120)}` as `0x${string}`
      }
    }
  },
  {
    id: "multicall-decoded-safe-transfer",
    title: "Decoded multicall containing safe ERC-20 transfer",
    source: "Generic",
    expectedVerdict: "WARN",
    request: {
      requestId: "multicall-decoded-safe-transfer",
      intent: {
        action: "multicall",
        chainId: CHAIN_ID,
        from: FROM,
        description: "Generic benchmark: decoded multicall with a safe child call."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeMulticallBytes([encodeErc20Transfer(RECIPIENT, 1n)])
      }
    }
  },
  {
    id: "multicall-decoded-unlimited-approval",
    title: "Decoded multicall containing unlimited approval",
    source: "GOAT",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "multicall-decoded-unlimited-approval",
      intent: {
        action: "multicall",
        chainId: CHAIN_ID,
        from: FROM,
        description: "GOAT benchmark: decoded plugin bundle hides an unlimited approval."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeMulticallBytes([encodeErc20Approve(SPENDER, MAX_UINT256)])
      }
    }
  },
  {
    id: "multicall-decoded-unknown-selector",
    title: "Decoded multicall containing unknown selector",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "multicall-decoded-unknown-selector",
      intent: {
        action: "multicall",
        chainId: CHAIN_ID,
        from: FROM,
        description: "Generic benchmark: decoded multicall contains opaque calldata."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeMulticallBytes(["0xdeadbeef"])
      }
    }
  },
  {
    id: "eip7702-authorization-list",
    title: "EIP-7702 authorization-list transaction",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "eip7702-authorization-list",
      intent: {
        action: "token_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1",
        description: "Generic benchmark: delegated EOA authorization attempt."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        type: 4,
        authorizationList: [{ address: OTHER }],
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    }
  },
  {
    id: "permit-signature-approval",
    title: "Permit signature approval attempt",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "permit-signature-approval",
      intent: {
        action: "approval",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER,
        description: "Generic benchmark: EIP-2612 permit should not bypass review."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: `0xd505accf${"0".repeat(64 * 7)}` as `0x${string}`
      }
    }
  },
  {
    id: "typed-data-permit-drain",
    title: "EIP-712 permit typed-data drain",
    source: "Generic",
    kind: "signature",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "typed-data-permit-drain",
      intent: {
        action: "permit",
        chainId: CHAIN_ID,
        from: FROM,
        verifyingContract: TOKEN,
        spender: SPENDER,
        maxAmount: MAX_UINT256.toString(),
        description: "Generic benchmark: off-chain permit approval request."
      },
      payload: {
        kind: "eip712_typed_data",
        typedData: {
          domain: {
            name: "TestToken",
            chainId: CHAIN_ID,
            verifyingContract: TOKEN
          },
          primaryType: "Permit",
          message: {
            owner: FROM,
            spender: SPENDER,
            value: MAX_UINT256.toString(),
            deadline: "9999999999"
          }
        }
      }
    }
  },
  {
    id: "state-insufficient-erc20-balance",
    title: "State-aware ERC-20 transfer with insufficient balance",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "state-insufficient-erc20-balance",
      intent: {
        action: "token_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1000000",
        description: "Generic benchmark: calldata is valid but state lacks funds."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1_000_000n)
      }
    },
    stateSnapshot: stateSnapshot({
      erc20: [
        {
          tokenAddress: TOKEN,
          owner: FROM,
          balance: "999999"
        }
      ]
    })
  },
  {
    id: "state-preexisting-dangerous-allowance",
    title: "State-aware approval with pre-existing dangerous allowance",
    source: "GOAT",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "state-preexisting-dangerous-allowance",
      intent: {
        action: "approval",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        spender: SPENDER,
        maxAmount: "1000",
        description:
          "GOAT benchmark: bounded approval still hides existing dangerous allowance."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Approve(SPENDER, 1_000n)
      }
    },
    stateSnapshot: stateSnapshot({
      erc20: [
        {
          tokenAddress: TOKEN,
          owner: FROM,
          spender: SPENDER,
          balance: "1000000",
          allowance: MAX_UINT256.toString()
        }
      ]
    })
  },
  {
    id: "state-fake-router-no-bytecode",
    title: "State-aware fake router target with no bytecode",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "state-fake-router-no-bytecode",
      intent: {
        action: "swap",
        chainId: CHAIN_ID,
        from: FROM,
        description: "Generic benchmark: swap target has no deployed code."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: ROUTER,
        value: "0",
        data: "0x38ed1739"
      }
    },
    stateSnapshot: stateSnapshot({
      target: {
        address: ROUTER,
        bytecode: "0x",
        isContract: false
      }
    })
  },
  {
    id: "state-native-transfer-to-contract",
    title: "State-aware native transfer to contract recipient",
    source: "AgentKit",
    expectedVerdict: "WARN",
    request: {
      requestId: "state-native-transfer-to-contract",
      intent: {
        action: "native_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        recipient: RECIPIENT,
        amount: "1",
        allowNativeValue: true,
        description: "AgentKit benchmark: native recipient is a contract."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: RECIPIENT,
        value: "1",
        data: "0x"
      }
    },
    stateSnapshot: stateSnapshot({
      target: {
        address: RECIPIENT,
        bytecode: "0x1234",
        isContract: true
      }
    })
  },
  {
    id: "state-lookup-failure",
    title: "State-aware lookup failure warning",
    source: "Generic",
    expectedVerdict: "WARN",
    request: {
      requestId: "state-lookup-failure",
      intent: {
        action: "token_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1",
        description: "Generic benchmark: RPC state lookup fails closed to warning."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    },
    stateSnapshot: stateSnapshot({
      lookupErrors: [
        {
          subject: TOKEN,
          operation: "erc20.balanceOf",
          message: "mock RPC unavailable"
        }
      ]
    })
  },
  {
    id: "typed-data-transfer-authorization",
    title: "EIP-3009 transfer authorization",
    source: "Generic",
    kind: "signature",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "typed-data-transfer-authorization",
      intent: {
        action: "authorization",
        chainId: CHAIN_ID,
        from: FROM,
        verifyingContract: TOKEN,
        description: "Generic benchmark: transfer authorization typed data."
      },
      payload: {
        kind: "eip712_typed_data",
        typedData: {
          domain: {
            name: "USDC",
            chainId: CHAIN_ID,
            verifyingContract: TOKEN
          },
          primaryType: "TransferWithAuthorization",
          message: {
            from: FROM,
            to: SPENDER,
            value: "1000000",
            validBefore: "9999999999"
          }
        }
      }
    }
  },
  {
    id: "blind-eth-sign",
    title: "Blind eth_sign request",
    source: "Generic",
    kind: "signature",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "blind-eth-sign",
      intent: {
        action: "unknown",
        chainId: CHAIN_ID,
        from: FROM,
        description: "Generic benchmark: opaque eth_sign payload."
      },
      payload: {
        kind: "eth_sign",
        message: "0xdeadbeef"
      }
    }
  },
  {
    id: "eip4337-hidden-approval",
    title: "EIP-4337 bundle containing approval selector",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "eip4337-hidden-approval",
      intent: {
        action: "contract_call",
        chainId: CHAIN_ID,
        from: FROM,
        description:
          "Generic benchmark: account abstraction bundle requires recursive review."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: ROUTER,
        value: "0",
        data: `0x1fad948c${"0".repeat(64)}095ea7b3${"0".repeat(120)}` as `0x${string}`
      }
    }
  },
  {
    id: "native-value-hidden-in-contract-call",
    title: "Native value attached to token transfer calldata",
    source: "AgentKit",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "native-value-hidden-in-contract-call",
      intent: {
        action: "token_transfer",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        recipient: RECIPIENT,
        amount: "1",
        description: "AgentKit benchmark: token transfer should not include native value."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "1",
        data: encodeErc20Transfer(RECIPIENT, 1n)
      }
    }
  },
  {
    id: "unknown-selector",
    title: "Unknown contract selector",
    source: "Generic",
    expectedVerdict: "BLOCK",
    request: {
      requestId: "unknown-selector",
      intent: {
        action: "contract_call",
        chainId: CHAIN_ID,
        from: FROM,
        tokenAddress: TOKEN,
        description: "Generic benchmark: opaque calldata."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: TOKEN,
        value: "0",
        data: "0xdeadbeef"
      }
    }
  },
  {
    id: "contract-deployment",
    title: "Contract deployment transaction",
    source: "Generic",
    expectedVerdict: "ALLOW",
    request: {
      requestId: "contract-deployment",
      intent: {
        action: "deployment",
        chainId: CHAIN_ID,
        from: FROM,
        description: "Generic benchmark: deployment with explicit deployment intent."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        value: "0",
        data: "0x60006000"
      }
    }
  },
  {
    id: "known-swap-selector",
    title: "Known router swap selector",
    source: "Eliza",
    expectedVerdict: "ALLOW",
    request: {
      requestId: "known-swap-selector",
      intent: {
        action: "swap",
        chainId: CHAIN_ID,
        from: FROM,
        description: "Eliza benchmark: swap action through known router selector."
      },
      transaction: {
        chainId: CHAIN_ID,
        from: FROM,
        to: ROUTER,
        value: "0",
        data: "0x38ed1739"
      }
    }
  }
];

function encodeErc20Transfer(recipient: Address, amount: bigint): `0x${string}` {
  return `0xa9059cbb${encodeAddress(recipient)}${encodeUint256(amount)}`;
}

function encodeErc20Approve(spender: Address, amount: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeSetApprovalForAll(operator: Address, approved: boolean): `0x${string}` {
  return `0xa22cb465${encodeAddress(operator)}${encodeUint256(approved ? 1n : 0n)}`;
}

function encodeMulticallBytes(calls: `0x${string}`[]): `0x${string}` {
  const offsets: string[] = [];
  const elements: string[] = [];
  let cursor = BigInt(calls.length * 32);

  for (const call of calls) {
    const element = encodeDynamicBytes(call);
    offsets.push(encodeUint256(cursor));
    elements.push(element);
    cursor += BigInt(element.length / 2);
  }

  return `0xac9650d8${encodeUint256(32n)}${encodeUint256(BigInt(calls.length))}${offsets.join("")}${elements.join("")}`;
}

function encodeDynamicBytes(value: `0x${string}`): string {
  const bytes = value.slice(2);
  const byteLength = BigInt(bytes.length / 2);
  return `${encodeUint256(byteLength)}${bytes.padEnd(
    Math.ceil(bytes.length / 64) * 64,
    "0"
  )}`;
}

function encodeAddress(address: Address): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function stateSnapshot(overrides: Partial<ChainStateSnapshot>): ChainStateSnapshot {
  return {
    chainId: CHAIN_ID,
    blockTag: "latest",
    account: {
      address: FROM,
      nativeBalance: "1000000000000000000",
      nonce: 1
    },
    target: {
      address: TOKEN,
      bytecode: "0x1234",
      isContract: true
    },
    erc20: [],
    erc721: [],
    erc1155: [],
    lookupErrors: [],
    ...overrides
  };
}
