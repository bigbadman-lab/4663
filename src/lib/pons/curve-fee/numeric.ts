/**
 * Exact uint256 / numeric(78,0) helpers.
 * Never use Number or floats for fee amounts.
 */

const UNSIGNED_DECIMAL_RE = /^[0-9]+$/;
const NUMERIC_78_MAX_DIGITS = 78;

export function uint256ToDecimalString(value: bigint): string {
  if (value < BigInt(0)) {
    throw new Error("[pons-v2-fees] uint256 amount must be non-negative");
  }
  const text = value.toString(10);
  if (text.length > NUMERIC_78_MAX_DIGITS) {
    throw new Error("[pons-v2-fees] amount exceeds numeric(78,0)");
  }
  return text;
}

export function decimalStringToUint256(value: string): bigint {
  const text = value.trim();
  if (!UNSIGNED_DECIMAL_RE.test(text) || /[eE.+-]/.test(text)) {
    throw new Error(
      `[pons-v2-fees] invalid unsigned decimal string: ${JSON.stringify(value)}`,
    );
  }
  if (text.length > NUMERIC_78_MAX_DIGITS) {
    throw new Error("[pons-v2-fees] amount exceeds numeric(78,0)");
  }
  return BigInt(text);
}

export function addQuoteAmounts(fee: bigint, tax: bigint): bigint {
  if (fee < BigInt(0) || tax < BigInt(0)) {
    throw new Error("[pons-v2-fees] fee and tax must be non-negative");
  }
  return fee + tax;
}

/**
 * Map a PostgREST numeric(78,0) value to an exact decimal string.
 *
 * Apply payloads MUST send fee_raw/tax_raw as JSON strings.
 * PostgREST SELECT of numeric(78,0) often returns a JSON *number* when the
 * value fits in IEEE-754. Application reads MUST request `column::text` so
 * values above Number.MAX_SAFE_INTEGER (e.g. 303733000000000000) stay exact.
 * This mapper still accepts safe JSON integers for older mocks; unsafe
 * numbers are rejected rather than rounded.
 */
export function mapDbNumericToDecimalString(
  value: unknown,
  field = "numeric",
): string {
  if (typeof value === "bigint") {
    return uint256ToDecimalString(value);
  }
  if (typeof value === "string") {
    return uint256ToDecimalString(decimalStringToUint256(value));
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `[pons-v2-fees] ${field} JSON number is not a safe non-negative integer: ${String(value)}`,
      );
    }
    return String(value);
  }
  throw new Error(
    `[pons-v2-fees] ${field} must be a decimal string, not ${typeof value}`,
  );
}

export function parseFeeAmount(value: bigint | string): bigint {
  if (typeof value === "bigint") {
    if (value < BigInt(0)) {
      throw new Error("[pons-v2-fees] fee amount must be non-negative");
    }
    uint256ToDecimalString(value);
    return value;
  }
  return decimalStringToUint256(value);
}
