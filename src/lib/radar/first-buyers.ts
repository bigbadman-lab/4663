import type { FirstBuyerRow } from "@/lib/worker/db-types";
import type { Launchpad } from "@/lib/radar/launchpad";
import type { RadarFirstBuyer } from "@/lib/radar/types";

/** Map a persisted first-buyer row into the launchpad-neutral RADAR read model. */
export function toRadarFirstBuyer(
  row: FirstBuyerRow,
  launchpad: Launchpad,
): RadarFirstBuyer {
  return {
    launchpad,
    tokenAddress: row.tokenAddress,
    walletAddress: row.walletAddress,
    firstBuyTxHash: row.firstBuyTxHash,
    firstBuyBlockNumber: row.firstBuyBlockNumber,
    firstBuyBlockTimestamp: row.firstBuyBlockTimestamp,
  };
}
