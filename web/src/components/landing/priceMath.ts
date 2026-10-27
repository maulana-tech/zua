import type { Rates } from "@/features/zcash/useZecPrice";
import type { FiatCode } from "@/lib/fiat";
import { zecToZat } from "@/lib/zcash/units";

/**
 * ZIP-317 fee for the simplest shielded payment: 5,000 zatoshi per logical
 * action, with a two-action minimum. Paid by the sender's wallet; bigger
 * transactions (many notes, many recipients) pay more.
 */
export const MIN_NETWORK_FEE_ZAT = 10_000n;

export type PriceCurrency = "ZEC" | FiatCode;

/** Zatoshi for a typed price, or null if it isn't a positive amount or has no rate. */
export function priceToZat(
  input: string,
  currency: PriceCurrency,
  rates: Rates | null,
): bigint | null {
  const value = input.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  if (currency === "ZEC") {
    try {
      const zat = zecToZat(value);
      return zat > 0n ? zat : null;
    } catch {
      return null;
    }
  }
  const rate = rates?.[currency];
  const amount = Number(value);
  if (!rate || !(amount > 0)) return null;
  const zat = BigInt(Math.round((amount / rate) * 1e8));
  return zat > 0n ? zat : null;
}

/** A ZEC amount in `currency` at the current rate, or null without one. */
export function zatToFiat(
  zat: bigint,
  currency: FiatCode,
  rates: Rates | null,
): number | null {
  const rate = rates?.[currency];
  return rate ? (Number(zat) / 1e8) * rate : null;
}
