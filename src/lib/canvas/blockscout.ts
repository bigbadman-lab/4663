/**
 * Robinhood Chain Blockscout helpers (public explorer links).
 */

export const ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN =
  "https://robinhoodchain.blockscout.com" as const;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Token page on Robinhood Chain Blockscout. */
export function robinhoodChainTokenExplorerUrl(tokenAddress: string): string {
  const normalized = tokenAddress.trim().toLowerCase();
  if (!ADDRESS_RE.test(normalized)) {
    return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/tokens`;
  }
  return `${ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN}/token/${normalized}`;
}
