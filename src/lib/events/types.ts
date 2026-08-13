/**
 * Public product event contract for Stage 9B / Stage 10 consumers.
 * Live stream remains pons_buying_activity; Summon history uses continuation.
 */

export const PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY =
  "pons_buying_activity" as const;

export const PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION =
  "pons_buyer_continuation" as const;

export type PublicEventType =
  | typeof PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY
  | typeof PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION;

export type PublicEvent = {
  id: string;
  type: PublicEventType;
  tokenAddress: string;
  newBuyers: number;
  occurredAt: string;
  triggerBlockNumber: number;
  triggerTxHash: string | null;
};

/** Summon-eligible historical continuation DTO (same shape as PublicEvent). */
export type SummonHistoryEvent = PublicEvent & {
  type: typeof PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION;
};

export type RecentPublicEventsResponse = {
  events: PublicEvent[];
};

export type SummonHistoryEventsResponse = {
  events: SummonHistoryEvent[];
};
