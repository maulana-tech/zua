// Invoices priced in USD are paid in ZEC at a locked quote. Integer math
// only: cents for USD, zatoshi for ZEC, micro-dollars for the price.

export const CURRENCIES = ["ZEC", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** How long a quoted ZEC amount stays valid for the payer. */
export const QUOTE_TTL_MS = 30 * 60_000;
/** Payments made against any quote issued within this window settle. */
export const QUOTE_GRACE_MS = 24 * 60 * 60_000;

/** "12.5" → 1250n cents. Throws on more than 2 decimals or junk. */
export function usdToCents(value: string): bigint {
  const v = value.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) throw new Error("Invalid USD amount");
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

export function centsToUsd(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const whole = (abs / 100n).toLocaleString("en-US");
  return `${sign}$${whole}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** USD price of 1 ZEC as integer micro-dollars (6 decimals). */
export function priceMicro(usdPerZec: number): bigint {
  if (!Number.isFinite(usdPerZec) || usdPerZec <= 0)
    throw new Error("Invalid price");
  return BigInt(Math.round(usdPerZec * 1_000_000));
}

/**
 * Zatoshi needed to pay `cents` at `micro` µ$/ZEC, rounded up so the payee
 * is never short by a rounding error.
 */
export function quoteZat(cents: bigint, micro: bigint): bigint {
  if (micro <= 0n) throw new Error("Invalid price");
  const numerator = cents * 10_000n * 100_000_000n; // µ$ × zat/ZEC
  return (numerator + micro - 1n) / micro;
}
