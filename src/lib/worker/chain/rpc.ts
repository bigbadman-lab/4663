/**
 * Server-only JSON-RPC / viem chain adapter for Robinhood Chain.
 * No PONS-specific semantics.
 */

import {
  createPublicClient,
  defineChain,
  hexToBigInt,
  hexToNumber,
  http,
  numberToHex,
  type Hash,
  type Hex,
  type PublicClient,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import { CHAIN_ID } from "@/lib/pons/constants";

export type RpcLog = {
  address: string;
  blockNumber: bigint | null;
  transactionHash: string | null;
  logIndex: number | null;
  topics: readonly string[];
  data: string;
};

export type RpcBlock = {
  number: number;
  /** Unix seconds (chain authority) */
  timestamp: number;
};

export type RpcTransaction = {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
};

/** topic0: one signature, or an OR-array of signatures (eth_getLogs topics[0] = [...]). */
export type Topic0Filter = string | readonly string[];

/**
 * Map ChainRpc topic0 into eth_getLogs `topics`.
 * string → [topic0]; string[] → [[topic0a, topic0b]] (OR).
 *
 * Must be sent via eth_getLogs JSON-RPC. viem client.getLogs() ignores a
 * `topics` field (it only accepts `event` / `events`), which is why the
 * live curve scan returned Initialized / SnipeTax* alongside CurveBuy.
 */
export function toViemGetLogTopics(
  topic0?: Topic0Filter,
): [Hex] | [Hex[]] | undefined {
  if (topic0 === undefined) return undefined;
  if (typeof topic0 === "string") {
    return [topic0 as Hex];
  }
  if (topic0.length === 0) {
    throw new Error("[4663-worker] eth_getLogs topic0 array must not be empty");
  }
  return [[...topic0] as Hex[]];
}

export type EthGetLogsFilter = {
  address?: Hex | Hex[];
  fromBlock: Hex;
  toBlock: Hex;
  topics?: [Hex] | [Hex[]];
};

/** JSON-RPC eth_getLogs params. Used so topic0 actually reaches the node. */
export function toEthGetLogsFilter(input: {
  address?: string | string[];
  fromBlock: number;
  toBlock: number;
  topic0?: Topic0Filter;
}): EthGetLogsFilter {
  const topics = toViemGetLogTopics(input.topic0);
  const address = input.address
    ? Array.isArray(input.address)
      ? (input.address as Hex[])
      : (input.address as Hex)
    : undefined;
  return {
    ...(address ? { address } : {}),
    fromBlock: numberToHex(input.fromBlock),
    toBlock: numberToHex(input.toBlock),
    ...(topics ? { topics } : {}),
  };
}

export type ChainRpc = {
  getBlockNumber(): Promise<number>;
  getBlock(blockNumber: number): Promise<RpcBlock>;
  getLogs(input: {
    address?: string | string[];
    fromBlock: number;
    toBlock: number;
    /**
     * topic0 filter when set.
     * A string matches one event; a string[] is an OR of topic0s.
     * Existing callers passing a single string are unchanged.
     */
    topic0?: Topic0Filter;
  }): Promise<RpcLog[]>;
  getTransaction(txHash: string): Promise<RpcTransaction>;
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt>;
  getCode(address: string): Promise<string | null>;
  /** Generic eth_call. Used by fee indexing for curve.pairToken(). */
  call(input: { to: string; data: string }): Promise<string>;
};

function safeRpcError(err: unknown): string {
  let msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  msg = msg.replace(/https?:\/\/\S+/gi, "[redacted-url]");
  msg = msg.replace(/alch_[A-Za-z0-9]+/g, "[redacted-key]");
  return (
    msg
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !l.startsWith("URL:") &&
          !l.startsWith("Request body:") &&
          !l.startsWith("Version:"),
      )
      .slice(0, 3)
      .join(" | ") || "unknown RPC error"
  );
}

export function createChainRpc(rpcUrl: string): ChainRpc {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const client: PublicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  return {
    async getBlockNumber() {
      try {
        return Number(await client.getBlockNumber());
      } catch (err) {
        throw new Error(
          `[4663-worker] eth_blockNumber failed: ${safeRpcError(err)}`,
        );
      }
    },

    async getBlock(blockNumber: number) {
      try {
        const block = await client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        return {
          number: Number(block.number),
          timestamp: Number(block.timestamp),
        };
      } catch (err) {
        throw new Error(
          `[4663-worker] eth_getBlockByNumber(${blockNumber}) failed: ${safeRpcError(err)}`,
        );
      }
    },

    async getLogs(input) {
      try {
        const filter = toEthGetLogsFilter(input);
        const logs = (await client.request({
          method: "eth_getLogs",
          params: [filter],
        })) as Array<{
          address: Hex;
          blockNumber: Hex | null;
          transactionHash: Hash | null;
          logIndex: Hex | null;
          topics: readonly Hex[];
          data: Hex;
        }>;
        return logs.map((log) => ({
          address: log.address,
          blockNumber:
            log.blockNumber === null || log.blockNumber === undefined
              ? null
              : hexToBigInt(log.blockNumber),
          transactionHash: log.transactionHash ?? null,
          logIndex:
            log.logIndex === null || log.logIndex === undefined
              ? null
              : hexToNumber(log.logIndex),
          topics: log.topics,
          data: log.data,
        }));
      } catch (err) {
        throw new Error(
          `[4663-worker] eth_getLogs(${input.fromBlock}-${input.toBlock}) failed: ${safeRpcError(err)}`,
        );
      }
    },

    async getTransaction(txHash: string) {
      try {
        const tx: Transaction = await client.getTransaction({
          hash: txHash as Hash,
        });
        return {
          hash: tx.hash,
          from: tx.from,
          to: tx.to ?? null,
          value: tx.value,
        };
      } catch (err) {
        throw new Error(
          `[4663-worker] eth_getTransactionByHash failed: ${safeRpcError(err)}`,
        );
      }
    },

    async getTransactionReceipt(txHash: string) {
      try {
        return await client.getTransactionReceipt({
          hash: txHash as Hash,
        });
      } catch (err) {
        throw new Error(
          `[4663-worker] eth_getTransactionReceipt failed: ${safeRpcError(err)}`,
        );
      }
    },

    async getCode(address: string) {
      try {
        const code = await client.getCode({
          address: address as Hex,
        });
        return code ?? null;
      } catch (err) {
        throw new Error(
          `[4663-worker] eth_getCode failed: ${safeRpcError(err)}`,
        );
      }
    },

    async call(input) {
      try {
        const result = await client.call({
          to: input.to as Hex,
          data: input.data as Hex,
        });
        return result.data ?? "0x";
      } catch (err) {
        throw new Error(
          `[4663-worker] eth_call(${input.to}) failed: ${safeRpcError(err)}`,
        );
      }
    },
  };
}

export { safeRpcError };
