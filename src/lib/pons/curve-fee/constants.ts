/**
 * PONS V2 bonding-curve fee stream constants.
 * Event topic0s are keccak of the canonical CurveBuy / CurveSell signatures.
 * The cursor stream is reserved for a later worker phase — not wired yet.
 */

export const CURSOR_STREAM_PONS_V2_CURVE_FEES = "pons_v2_curve_fees" as const;

export const PONS_V2_CURVE_FEE_VENUE = "curve" as const;
export const PONS_V2_FEE_LAUNCHPAD = "pons" as const;
export const PONS_V2_FEE_FACTORY_VERSION = "v2" as const;

/** CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax) */
export const PONS_V2_CURVE_BUY_TOPIC0 =
  "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455" as const;

/** CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax) */
export const PONS_V2_CURVE_SELL_TOPIC0 =
  "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df" as const;

/** eth_getLogs topic0 OR: CurveBuy | CurveSell */
export const PONS_V2_CURVE_FEE_TOPIC0S = [
  PONS_V2_CURVE_BUY_TOPIC0,
  PONS_V2_CURVE_SELL_TOPIC0,
] as const;

/** Native ETH as pairToken / quote. Amounts are still quote-denominated, not native-named. */
export const NATIVE_QUOTE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/**
 * Other BondingCurve events seen on the live specimen (not Global Fees Paid).
 * Kept for operator classification only — never decoded as fee amounts.
 */
export const PONS_V2_CURVE_INITIALIZED_TOPIC0 =
  "0x908408e307fc569b417f6cbec5d5a06f44a0a505ac0479b47d421a4b2fd6a1e6" as const;
export const PONS_V2_SNIPE_TAX_EXEMPTED_TOPIC0 =
  "0xe4b7e48fbd47c2f602bacadee76ad33b16542ddb4997cfc0de04c311adcfa8c7" as const;
export const PONS_V2_SNIPE_TAX_CHARGED_TOPIC0 =
  "0x3bc39a5562b28f5fe8f36cecabfbaa12bb969acf05717994709225fc412a9934" as const;
