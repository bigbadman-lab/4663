/**
 * Public product event contract for Stage 9B / Stage 10 consumers.
 */

export const PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY =
  "pons_buying_activity" as const;

export type PublicEventType = typeof PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY;

export type PublicEvent = {
  id: string;
  type: PublicEventType;
  tokenAddress: string;
  newBuyers: number;
  occurredAt: string;
  triggerBlockNumber: number;
  triggerTxHash: string | null;
};

export type RecentPublicEventsResponse = {
  events: PublicEvent[];
};
