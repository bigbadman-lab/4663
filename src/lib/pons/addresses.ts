/**
 * Empirically validated PONS addresses and factory event topic0s.
 * Ported from pons-data-lab/src/pons/addresses.ts — do not invent signatures.
 */

import { getAddress } from "viem";

/** Canonical checksummed forms (research registry). */
export const PONS_V1_FACTORY_CHECKSUM = getAddress(
  "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB",
);
export const PONS_V2_FACTORY_CHECKSUM = getAddress(
  "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
);

/** Lowercase storage form used by 4663 Stage 1 CHECK constraints. */
export const PONS_V1_FACTORY =
  PONS_V1_FACTORY_CHECKSUM.toLowerCase() as `0x${string}`;
export const PONS_V2_FACTORY =
  PONS_V2_FACTORY_CHECKSUM.toLowerCase() as `0x${string}`;

/** Chain-native WETH — structural landmark for V1 market scoring. */
export const RHC_WETH = getAddress(
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
).toLowerCase() as `0x${string}`;

/** Recurring V1 launch helper (structural landmark only). */
export const V1_LAUNCH_HELPER = getAddress(
  "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
).toLowerCase() as `0x${string}`;

/** Observed V1 factory topic0 signatures (unnamed). */
export const V1_FACTORY_TOPIC0_A =
  "0x1461370115e1c2be79cb529f8cfcbd11316e789d9c6099fc83417b0b4c48c62a" as const;
export const V1_FACTORY_TOPIC0_B =
  "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a" as const;

/** Observed V2 factory topic0 (unnamed). */
export const V2_FACTORY_TOPIC0 =
  "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607" as const;

/**
 * V1 helper receipt topic0 with market in data_word[1]
 * (Stage 05 structural pattern from pons-data-lab).
 */
export const V1_HELPER_MARKET_DATA_TOPIC0 =
  "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118" as const;

export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
