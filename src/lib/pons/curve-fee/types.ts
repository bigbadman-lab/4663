export type PonsV2CurveFeeSide = "buy" | "sell";

export type PonsV2CurveFeeLogLike = {
  address: string;
  blockNumber: bigint | number | null;
  transactionHash: string | null;
  logIndex: bigint | number | null;
  topics: readonly string[];
  data: string;
};

/**
 * Decoded CurveBuy / CurveSell.
 * Fee fields are bigint plus decimal strings for the DB numeric(78,0) boundary.
 * Never use Number for fee/tax/total.
 */
export type DecodedPonsV2CurveFee = {
  side: PonsV2CurveFeeSide;
  curveAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  fee: bigint;
  tax: bigint;
  totalFee: bigint;
  feeRaw: string;
  taxRaw: string;
  totalFeeRaw: string;
};

export type PonsV2CurveFeeApplyInput = {
  chainId: number;
  tokenAddress: string;
  curveAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  side: PonsV2CurveFeeSide;
  feeRaw: bigint | string;
  taxRaw: bigint | string;
  quoteTokenAddress: string;
};

export type PonsV2CurveFeeEventRow = {
  chainId: number;
  tokenAddress: string;
  curveAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  side: PonsV2CurveFeeSide;
  feeRaw: string;
  taxRaw: string;
  totalFeeRaw: string;
  venue: "curve";
};

export type TokenFeeMetricsRow = {
  chainId: number;
  tokenAddress: string;
  launchpad: "pons";
  factoryVersion: "v2";
  quoteTokenAddress: string;
  globalFeesPaidQuote: string;
  buyFeesQuote: string;
  sellFeesQuote: string;
  buyCount: number;
  sellCount: number;
  lastFeeBlock: number;
};

export type ApplyPonsV2CurveFeesResult = {
  status: "ok";
  applied: number;
  skipped: number;
};
