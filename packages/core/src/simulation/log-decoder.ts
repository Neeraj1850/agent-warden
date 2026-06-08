import { getAddress, id, toBeHex, zeroPadValue } from "ethers";
import type { ObservedApproval, SimulationLog } from "../types/report.types.js";
import type { Address, Hex, TokenBalanceDelta } from "../types/transaction.types.js";

const TRANSFER_TOPIC = id("Transfer(address,address,uint256)").toLowerCase();
const APPROVAL_TOPIC = id("Approval(address,address,uint256)").toLowerCase();
const APPROVAL_FOR_ALL_TOPIC = id("ApprovalForAll(address,address,bool)").toLowerCase();
const TRANSFER_SINGLE_TOPIC = id(
  "TransferSingle(address,address,address,uint256,uint256)"
).toLowerCase();
const TRANSFER_BATCH_TOPIC = id(
  "TransferBatch(address,address,address,uint256[],uint256[])"
).toLowerCase();
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export function decodeSimulationLogs(logs: SimulationLog[]): {
  observedAssetDeltas: TokenBalanceDelta[];
  observedApprovals: ObservedApproval[];
} {
  const observedAssetDeltas: TokenBalanceDelta[] = [];
  const observedApprovals: ObservedApproval[] = [];

  for (const log of logs) {
    const topic0 = log.topics[0]?.toLowerCase();

    if (topic0 === TRANSFER_TOPIC) {
      observedAssetDeltas.push(...decodeTransferLog(log));
      continue;
    }

    if (topic0 === APPROVAL_TOPIC) {
      const approval = decodeApprovalLog(log);
      if (approval) {
        observedApprovals.push(approval);
      }
      continue;
    }

    if (topic0 === APPROVAL_FOR_ALL_TOPIC) {
      const approval = decodeApprovalForAllLog(log);
      if (approval) {
        observedApprovals.push(approval);
      }
      continue;
    }

    if (topic0 === TRANSFER_SINGLE_TOPIC) {
      observedAssetDeltas.push(...decodeTransferSingleLog(log));
      continue;
    }

    if (topic0 === TRANSFER_BATCH_TOPIC) {
      observedAssetDeltas.push(...decodeTransferBatchLog(log));
    }
  }

  return { observedAssetDeltas, observedApprovals };
}

function decodeTransferLog(log: SimulationLog): TokenBalanceDelta[] {
  const from = topicAddress(log.topics[1]);
  const to = topicAddress(log.topics[2]);

  if (!from || !to) {
    return [];
  }

  if (log.topics.length >= 4) {
    const tokenId = BigInt(log.topics[3]!).toString();

    return transferPair({
      assetStandard: "erc721",
      tokenAddress: log.address,
      from,
      to,
      amount: "1",
      tokenId
    });
  }

  const amount = BigInt(log.data).toString();

  return transferPair({
    assetStandard: "erc20",
    tokenAddress: log.address,
    from,
    to,
    amount
  });
}

function decodeApprovalLog(log: SimulationLog): ObservedApproval | undefined {
  const owner = topicAddress(log.topics[1]);
  const spender = topicAddress(log.topics[2]);

  if (!owner || !spender) {
    return undefined;
  }

  if (log.topics.length >= 4) {
    return {
      standard: "erc721",
      tokenAddress: log.address,
      owner,
      spender,
      tokenId: BigInt(log.topics[3]!).toString()
    };
  }

  return {
    standard: "erc20",
    tokenAddress: log.address,
    owner,
    spender,
    amount: BigInt(log.data).toString()
  };
}

function decodeApprovalForAllLog(log: SimulationLog): ObservedApproval | undefined {
  const owner = topicAddress(log.topics[1]);
  const operator = topicAddress(log.topics[2]);

  if (!owner || !operator) {
    return undefined;
  }

  return {
    standard: "unknown",
    tokenAddress: log.address,
    owner,
    operator,
    approved: BigInt(log.data) !== 0n
  };
}

function decodeTransferSingleLog(log: SimulationLog): TokenBalanceDelta[] {
  const from = topicAddress(log.topics[2]);
  const to = topicAddress(log.topics[3]);
  const words = dataWords(log.data);

  if (!from || !to || words.length < 2) {
    return [];
  }

  return transferPair({
    assetStandard: "erc1155",
    tokenAddress: log.address,
    from,
    to,
    tokenId: BigInt(words[0]!).toString(),
    amount: BigInt(words[1]!).toString()
  });
}

function decodeTransferBatchLog(log: SimulationLog): TokenBalanceDelta[] {
  const from = topicAddress(log.topics[2]);
  const to = topicAddress(log.topics[3]);
  const words = dataWords(log.data);

  if (!from || !to || words.length < 5) {
    return [];
  }

  const idsOffset = Number(BigInt(words[0]!) / 32n);
  const valuesOffset = Number(BigInt(words[1]!) / 32n);
  const idsLength = Number(BigInt(words[idsOffset]!));
  const valuesLength = Number(BigInt(words[valuesOffset]!));
  const length = Math.min(idsLength, valuesLength);
  const deltas: TokenBalanceDelta[] = [];

  for (let index = 0; index < length; index += 1) {
    deltas.push(
      ...transferPair({
        assetStandard: "erc1155",
        tokenAddress: log.address,
        from,
        to,
        tokenId: BigInt(words[idsOffset + 1 + index]!).toString(),
        amount: BigInt(words[valuesOffset + 1 + index]!).toString()
      })
    );
  }

  return deltas;
}

function transferPair(input: {
  assetStandard: TokenBalanceDelta["assetStandard"];
  tokenAddress: Address;
  from: Address;
  to: Address;
  amount: string;
  tokenId?: string;
}): TokenBalanceDelta[] {
  const deltas: TokenBalanceDelta[] = [];

  if (input.from !== ZERO_ADDRESS) {
    deltas.push({
      assetStandard: input.assetStandard,
      tokenAddress: input.tokenAddress,
      account: input.from,
      delta: `-${input.amount}`,
      tokenId: input.tokenId
    });
  }

  if (input.to !== ZERO_ADDRESS) {
    deltas.push({
      assetStandard: input.assetStandard,
      tokenAddress: input.tokenAddress,
      account: input.to,
      delta: input.amount,
      tokenId: input.tokenId
    });
  }

  return deltas;
}

function topicAddress(topic: Hex | undefined): Address | undefined {
  if (!topic) {
    return undefined;
  }

  return getAddress(`0x${topic.slice(-40)}`) as Address;
}

function dataWords(data: Hex): Hex[] {
  const hex = data.slice(2);
  const words: Hex[] = [];

  for (let index = 0; index < hex.length; index += 64) {
    words.push(`0x${hex.slice(index, index + 64).padEnd(64, "0")}` as Hex);
  }

  return words;
}

export function encodeTopicAddress(address: Address): Hex {
  return zeroPadValue(address, 32) as Hex;
}

export function encodeUint256Topic(value: bigint): Hex {
  return toBeHex(value, 32) as Hex;
}

export const simulationEventTopics = {
  transfer: TRANSFER_TOPIC as Hex,
  approval: APPROVAL_TOPIC as Hex,
  approvalForAll: APPROVAL_FOR_ALL_TOPIC as Hex,
  transferSingle: TRANSFER_SINGLE_TOPIC as Hex,
  transferBatch: TRANSFER_BATCH_TOPIC as Hex
} as const;
