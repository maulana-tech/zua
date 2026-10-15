import { zecUsd } from "@/server/lib/zecPrice";

// ZEC/USD reference price for display ("≈ $12.34").
export const dynamic = "force-dynamic";

export async function GET() {
  const price = await zecUsd();
  if (!price)
    return Response.json({ error: "Price unavailable" }, { status: 503 });
  return Response.json(price, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
