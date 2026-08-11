/**
 * Server-only JSON-RPC / viem chain adapter for Robinhood Chain.
 * No PONS-specific semantics.
 */

import {
  createPublicClient,
  defineChain,
  http,
  type Hash,
  type Hex,
  type Log,
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

export type ChainRpc = {
  getBlockNumber(): Promise<number>;
  getBlock(blockNumber: number): Promise<RpcBlock>;
  getLogs(input: {
    address?: string | string[];
    fromBlock: number;
    toBlock: number;
    /** topic0 filter when set (e.g. ERC-20 Transfer). */
    topic0?: string;
  }): Promise<RpcLog[]>;
  getTransaction(txHash: string): Promise<RpcTransaction>;
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt>;
  getCode(address: string): Promise<string | null>;
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
        const logs: Log[] = await client.getLogs({
          address: input.address
            ? Array.isArray(input.address)
              ? (input.address as Hex[])
              : (input.address as Hex)
            : undefined,
          fromBlock: BigInt(input.fromBlock),
          toBlock: BigInt(input.toBlock),
          ...(input.topic0
            ? { topics: [input.topic0 as Hex] }
            : {}),
        });
        return logs.map((log) => ({
          address: log.address,
          blockNumber: log.blockNumber ?? null,
          transactionHash: log.transactionHash ?? null,
          logIndex:
            log.logIndex === null || log.logIndex === undefined
              ? null
              : Number(log.logIndex),
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
  };
}

export { safeRpcError };
