import "server-only";

// ZEC/USD from CoinGecko, cached for a minute. Used for display and to lock
// USD invoice quotes; the payee always receives the quoted ZEC amount.
const UPSTREAM =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd";
let cache: { usd: number; fetchedAt: number } | null = null;

/** Latest price, or the last good one; null if none was ever fetched. */
export async function zecUsd(): Promise<{
  usd: number;
  fetchedAt: number;
} | null> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > 60_000) {
    try {
      const res = await fetch(UPSTREAM, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      const usd = Number((await res.json())?.zcash?.usd);
      if (res.ok && Number.isFinite(usd) && usd > 0)
        cache = { usd, fetchedAt: now };
    } catch {
      // keep the last good price
    }
  }
  return cache;
}
