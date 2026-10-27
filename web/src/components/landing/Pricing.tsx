"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useRates } from "@/features/zcash/useZecPrice";
import {
  defaultFiat,
  FIAT_CURRENCIES,
  type FiatCode,
  formatFiat,
  isFiatCode,
} from "@/lib/fiat";
import { cn } from "@/lib/utils";
import { zatToZec } from "@/lib/zcash/units";
import {
  MIN_NETWORK_FEE_ZAT,
  type PriceCurrency,
  priceToZat,
  zatToFiat,
} from "./priceMath";
import { Frame, MonoLabel, panel, SectionIntro } from "./primitives";

const PRESETS = ["5", "50", "500"];

export function Pricing() {
  const rates = useRates();
  const [currency, setCurrency] = useState<PriceCurrency>("USD");
  const [price, setPrice] = useState("50");

  // Start in the visitor's own currency (from the browser language).
  useEffect(() => {
    setCurrency(defaultFiat(navigator.language));
  }, []);

  // Without a live rate, fall back to pricing in ZEC.
  const live = currency === "ZEC" || Boolean(rates?.[currency]);
  const zat = priceToZat(price, currency, rates);
  const fiatCode: FiatCode | null =
    currency !== "ZEC" ? currency : rates?.USD ? "USD" : null;
  const inFiat = (z: bigint) => {
    if (!fiatCode) return null;
    const value = zatToFiat(z, fiatCode, rates);
    return value === null
      ? null
      : `≈ ${new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: fiatCode,
          maximumSignificantDigits: 3,
        }).format(value)}`;
  };

  const rows: { label: string; value: string; note: string | null }[] = [
    {
      label: "Customer pays",
      value: zat ? `${zatToZec(zat)} ZEC` : "—",
      note: "Plus the network fee, from their own wallet.",
    },
    {
      label: "You receive",
      value: zat ? `${zatToZec(zat)} ZEC` : "—",
      note: "All of it, straight into your shielded balance.",
    },
    {
      label: "Network fee",
      value: `${zatToZec(MIN_NETWORK_FEE_ZAT)} ZEC`,
      note: [
        inFiat(MIN_NETWORK_FEE_ZAT),
        "the ZIP-317 minimum for a simple payment, paid by the sender",
      ]
        .filter(Boolean)
        .join(", "),
    },
    {
      label: "Zua fee",
      value: "0",
      note: "Zua adds no fee of its own to payments.",
    },
  ];

  return (
    <section
      id="pricing"
      data-ed-section
      aria-labelledby="pricing-title"
      className="relative py-24 sm:py-32"
    >
      <Frame>
        <SectionIntro
          label="What it costs"
          titleId="pricing-title"
          title="No Zua fee. Only the Zcash network fee."
        >
          You receive the full amount. The payer&rsquo;s wallet pays a small
          network fee set by ZIP-317. Type a price to see it in ZEC at
          today&rsquo;s rate.
        </SectionIntro>

        <div
          className={cn(
            panel,
            "mt-14 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,5fr)_7fr]",
          )}
        >
          <form
            onSubmit={(event) => event.preventDefault()}
            className="border-b border-starlight/10 p-6 sm:p-10 lg:border-r lg:border-b-0"
          >
            <label htmlFor="pricing-amount">
              <MonoLabel className="text-[11px] text-starlight/50">
                Your price
              </MonoLabel>
            </label>
            <div className="mt-3 flex items-stretch border border-starlight/20 bg-void focus-within:border-violet">
              <input
                id="pricing-amount"
                inputMode="decimal"
                autoComplete="off"
                value={price}
                onChange={(event) =>
                  setPrice(event.target.value.replace(",", "."))
                }
                aria-describedby="pricing-rate"
                className="w-full min-w-0 flex-1 bg-transparent px-4 py-3 text-3xl font-normal tabular-nums outline-none"
              />
              <span className="relative flex items-center border-l border-starlight/15">
                <label htmlFor="pricing-currency" className="sr-only">
                  Currency
                </label>
                <select
                  id="pricing-currency"
                  value={currency}
                  onChange={(event) => {
                    const v = event.target.value;
                    if (v === "ZEC" || isFiatCode(v)) setCurrency(v);
                  }}
                  className="h-full cursor-pointer appearance-none bg-transparent py-3 pr-9 pl-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet"
                >
                  <option value="ZEC">ZEC</option>
                  {FIAT_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 size-4 text-starlight/60"
                  aria-hidden="true"
                />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrice(p)}
                  className="min-h-9 rounded-full border border-starlight/15 px-3.5 text-sm text-starlight/75 transition-colors hover:border-starlight/50 hover:text-starlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                >
                  {currency === "ZEC"
                    ? `${p} ZEC`
                    : formatFiat(Number(p), currency)}
                </button>
              ))}
            </div>
            <p
              id="pricing-rate"
              className="mt-6 text-sm leading-relaxed text-starlight/55"
            >
              {currency === "ZEC"
                ? "Payments are always in ZEC."
                : live
                  ? `1 ZEC ≈ ${formatFiat(rates?.[currency] ?? 0, currency)} (CoinGecko, refreshed every minute). Payments are always in ZEC; USD invoices lock their rate for 30 minutes.`
                  : "Live rates are unavailable right now. Pick ZEC to price directly."}
            </p>
          </form>

          <dl aria-live="polite" className="grid">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid gap-1 border-b border-starlight/10 px-6 py-5 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6 sm:px-10"
              >
                <dt>
                  <MonoLabel className="text-[11px] text-starlight/50">
                    {row.label}
                  </MonoLabel>
                </dt>
                <dd>
                  <span className="block text-2xl font-normal tracking-tight tabular-nums">
                    {row.value}
                  </span>
                  {row.note ? (
                    <span className="mt-1 block text-sm text-starlight/55">
                      {row.note}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Frame>
    </section>
  );
}
