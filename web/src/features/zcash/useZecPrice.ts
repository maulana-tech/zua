"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultFiat,
  type FiatCode,
  formatFiat,
  isFiatCode,
} from "../../lib/fiat";
import { ZAT_PER_ZEC } from "../../lib/zcash/units";

export type Rates = Partial<Record<FiatCode, number>>;

let shared: Promise<Rates | null> | null = null;

function fetchRates(): Promise<Rates | null> {
  shared ??= fetch("/api/zec-price")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (typeof d?.usd !== "number") return null;
      return { ...(d.rates ?? {}), USD: d.usd } as Rates;
    })
    .catch(() => null)
    .finally(() => setTimeout(() => (shared = null), 60_000));
  return shared;
}

/** Price of 1 ZEC in every currency CoinGecko returned, or null while loading/unavailable. */
export function useRates(): Rates | null {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchRates().then((r) => alive && setRates(r));
    return () => {
      alive = false;
    };
  }, []);
  return rates;
}

/** ZEC/USD reference price, or null while loading/unavailable. */
export function useZecPrice(): number | null {
  return useRates()?.USD ?? null;
}

/** "≈ $12.34" for an amount in zatoshi, or null without a price. */
export function formatUsd(zat: bigint, price: number | null): string | null {
  if (price === null) return null;
  const usd = (Number(zat) / Number(ZAT_PER_ZEC)) * price;
  return `≈ ${usd.toLocaleString("en-US", { style: "currency", currency: "USD" })}`;
}

// The display currency is a per-device preference (not sensitive, so plain
// localStorage); every open screen follows a change through this event.
const CURRENCY_KEY = "zua:display-currency";
const CURRENCY_EVENT = "zua:display-currency";

function storedCurrency(): FiatCode {
  try {
    const saved = localStorage.getItem(CURRENCY_KEY);
    if (isFiatCode(saved)) return saved;
  } catch {}
  return defaultFiat(
    typeof navigator === "undefined" ? undefined : navigator.language,
  );
}

export function setDisplayCurrency(code: FiatCode): void {
  try {
    localStorage.setItem(CURRENCY_KEY, code);
  } catch {}
  window.dispatchEvent(new Event(CURRENCY_EVENT));
}

export type Fiat = {
  currency: FiatCode;
  /** Price of 1 ZEC in `currency`, or null while loading/unavailable. */
  rate: number | null;
  /** "≈ Rp 21.572" for an amount in zatoshi, or null without a price. */
  format: (zat: bigint) => string | null;
  /** Plain "Rp 21.572" for an amount already in the currency. */
  formatAmount: (amount: number) => string;
  /** Zatoshi worth `amount` of the currency at the current rate. */
  toZat: (amount: number) => bigint | null;
};

/** ZEC amounts in the user's display currency (defaults from the locale). */
export function useFiat(): Fiat {
  const rates = useRates();
  const [currency, setCurrency] = useState<FiatCode>("USD");
  useEffect(() => {
    const update = () => setCurrency(storedCurrency());
    update();
    window.addEventListener(CURRENCY_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CURRENCY_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  // Fall back to USD when the chosen currency has no price right now.
  const shown: FiatCode = rates && !rates[currency] ? "USD" : currency;
  const rate = rates?.[shown] ?? null;
  const formatAmount = useCallback(
    (amount: number) => formatFiat(amount, shown),
    [shown],
  );
  const format = useCallback(
    (zat: bigint) =>
      rate === null
        ? null
        : `≈ ${formatFiat((Number(zat) / Number(ZAT_PER_ZEC)) * rate, shown)}`,
    [rate, shown],
  );
  const toZat = useCallback(
    (amount: number) =>
      rate === null || !Number.isFinite(amount) || amount <= 0
        ? null
        : BigInt(Math.round((amount / rate) * Number(ZAT_PER_ZEC))),
    [rate],
  );
  return { currency: shown, rate, format, formatAmount, toZat };
}
