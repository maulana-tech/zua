"use client";

import { useEffect, useState } from "react";
import { ZAT_PER_ZEC } from "../../lib/zcash/units";

let shared: Promise<number | null> | null = null;

function fetchPrice(): Promise<number | null> {
  shared ??= fetch("/api/zec-price")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (typeof d?.usd === "number" ? d.usd : null))
    .catch(() => null)
    .finally(() => setTimeout(() => (shared = null), 60_000));
  return shared;
}

/** ZEC/USD reference price, or null while loading/unavailable. */
export function useZecPrice(): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPrice().then((p) => alive && setPrice(p));
    return () => {
      alive = false;
    };
  }, []);
  return price;
}

/** "≈ $12.34" for an amount in zatoshi, or null without a price. */
export function formatUsd(zat: bigint, price: number | null): string | null {
  if (price === null) return null;
  const usd = (Number(zat) / Number(ZAT_PER_ZEC)) * price;
  return `≈ ${usd.toLocaleString("en-US", { style: "currency", currency: "USD" })}`;
}
