/**
 * Robinhood Chain Blockscout helpers (public explorer links).
 */

export const ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN =
  "https://robinhoodchain.blockscout.com" as const;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function normalizeAddress(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS_RE.test(normalized)) return null;
  return normalized;
}

function normalizeTxHash(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!TX_HASH_RE.test(normalized)) return null;
  return normalized;
}

/** Token page on Robinhood Chain Blockscout. */
export function robinhoodChainTokenExplorerUrl(tokenAddress: string): string {
  const normalized = normalizeAddress(tokenAddress);
  if (!normalized) {
    return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/tokens`;
  }
  return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/token/${normalized}`;
}

/** Address / wallet page. */
export function robinhoodChainAddressExplorerUrl(address: string): string {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/accounts`;
  }
  return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/address/${normalized}`;
}

/** Transaction page. */
export function robinhoodChainTxExplorerUrl(txHash: string): string {
  const normalized = normalizeTxHash(txHash);
  if (!normalized) {
    return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/txs`;
  }
  return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/tx/${normalized}`;
}

/** Block page. */
export function robinhoodChainBlockExplorerUrl(blockNumber: number): string {
  const n = Math.trunc(blockNumber);
  if (!Number.isFinite(n) || n < 0) {
    return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/blocks`;
  }
  return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/block/${n}`;
}
