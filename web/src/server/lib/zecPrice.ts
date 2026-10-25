import "server-only";
import { FIAT_CURRENCIES, type FiatCode } from "../../lib/fiat";

// ZEC prices from CoinGecko, cached for a minute. USD locks USD invoice
// quotes (the payee always receives the quoted ZEC amount); the rest are for
// display in the user's currency.
const UPSTREAM = `https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=${FIAT_CURRENCIES.map(
  (c) => c.code.toLowerCase(),
).join(",")}`;

export type ZecPrice = {
  usd: number;
  /** ZEC price per currency code; USD is always present. */
  rates: Partial<Record<FiatCode, number>>;
  fetchedAt: number;
};

let cache: ZecPrice | null = null;

/** Latest price, or the last good one; null if none was ever fetched. */
export async function zecUsd(): Promise<ZecPrice | null> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > 60_000) {
    try {
      const res = await fetch(UPSTREAM, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      const raw = (await res.json())?.zcash ?? {};
      const usd = Number(raw.usd);
      if (res.ok && Number.isFinite(usd) && usd > 0) {
        const rates: ZecPrice["rates"] = {};
        for (const { code } of FIAT_CURRENCIES) {
          const value = Number(raw[code.toLowerCase()]);
          if (Number.isFinite(value) && value > 0) rates[code] = value;
        }
        cache = { usd, rates: { ...rates, USD: usd }, fetchedAt: now };
      }
    } catch {
      // keep the last good price
    }
  }
  return cache;
}
