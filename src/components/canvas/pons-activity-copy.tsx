"use client";

/**
 * Shared internal hierarchy for PONS activity cards.
 * Live and summoned objects reuse this presentation only.
 */

import {
  PONS_BUYER_COUNT_COLOR,
  PONS_EARLIER_LABEL_COLOR,
  PONS_NEW_WALLETS_COLOR,
} from "@/lib/canvas/pons-visual";

export type PonsActivityCopyProps = {
  newBuyers: number;
  /** Historical cue for summoned objects. */
  earlierLabel?: boolean;
};

export function PonsActivityCopy({
  newBuyers,
  earlierLabel = false,
}: PonsActivityCopyProps) {
  return (
    <div data-4663-pons-activity-copy>
      {earlierLabel ? (
        <p
          className="mb-1 text-[10px] font-medium tracking-wide uppercase"
          style={{ color: PONS_EARLIER_LABEL_COLOR }}
          data-4663-pons-earlier-label
        >
          EARLIER
        </p>
      ) : null}
      <p
        className="text-[1.35rem] leading-none font-bold tabular-nums sm:text-[1.5rem]"
        style={{ color: PONS_BUYER_COUNT_COLOR }}
        data-4663-pons-buyer-count
      >
        {newBuyers}
      </p>
      <p className="mt-1 text-[11px] leading-snug">
        <span
          className="font-semibold tracking-wide uppercase"
          style={{ color: PONS_NEW_WALLETS_COLOR }}
          data-4663-pons-new-wallets
        >
          NEW WALLETS
        </span>{" "}
        <span className="font-normal text-neutral-900" data-4663-pons-body>
          bought this token
        </span>
      </p>
    </div>
  );
}
