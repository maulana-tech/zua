// ZEC/USD reference price for display only ("≈ $12.34"). Never used to move
// money. Cached for a minute so page loads don't hammer the upstream API.
export const dynamic = "force-dynamic";

const UPSTREAM =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd";
let cache: { usd: number; fetchedAt: number } | null = null;

export async function GET() {
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
  if (!cache)
    return Response.json({ error: "Price unavailable" }, { status: 503 });
  return Response.json(cache, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
