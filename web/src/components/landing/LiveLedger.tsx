"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  FileText,
  Link2,
  Lock,
  Pause,
  Play,
  ShoppingBag,
  Sparkles,
  Store,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFiat } from "@/features/zcash/useZecPrice";
import { cn } from "@/lib/utils";
import { zatToZec } from "@/lib/zcash/units";
import { useInView, useReducedMotion } from "./hooks";
import { MonoLabel, panel, segmentButton, segmentGroup } from "./primitives";

type FeedItem = {
  icon: LucideIcon;
  title: string;
  memo: string;
  zat: bigint;
};

// A freelancer's week, replayed. Amounts are ZEC; the memo is what the payer
// wrote (or the tag Zua put in the payment request).
const FEED: FeedItem[] = [
  {
    icon: FileText,
    title: "Invoice INV-0042 paid",
    memo: "Logo design",
    zat: 80_000_000n,
  },
  {
    icon: Link2,
    title: "Payment link",
    memo: "Brand audit",
    zat: 35_000_000n,
  },
  {
    icon: Sparkles,
    title: "Tip",
    memo: "Loved the poster series",
    zat: 2_000_000n,
  },
  {
    icon: ArrowDownLeft,
    title: "Request paid",
    memo: "October retainer",
    zat: 120_000_000n,
  },
  {
    icon: ShoppingBag,
    title: "Checkout order_1042",
    memo: "Print shop",
    zat: 12_000_000n,
  },
  {
    icon: Store,
    title: "Sale",
    memo: "Workshop ticket",
    zat: 25_000_000n,
  },
];

const OPENING_BALANCE = 240_000_000n;
const VISIBLE = 4;
const TICK_MS = 3200;
const START_BLOCK = 3_141_592;

type View = "you" | "chain";

/** Arrival n of the replayed feed (0-based), cycling through FEED. */
const itemAt = (n: number) => FEED[n % FEED.length];

/**
 * Hero demo: payments arriving in a shielded balance, seen two ways. "You"
 * is what the wallet decrypts in the browser; "Chain" is everything a block
 * explorer can tell about the same transactions.
 */
export function LiveLedger() {
  const [view, setView] = useState<View>("you");
  // How many payments have arrived; the newest VISIBLE are listed.
  const [arrived, setArrived] = useState(3);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);
  const reduceMotion = useReducedMotion();
  const fiat = useFiat();

  const running = inView && !paused && !reduceMotion;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setArrived((n) => n + 1), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  let balance = OPENING_BALANCE;
  for (let n = 0; n < arrived; n++) balance += itemAt(n).zat;
  const rows = Array.from(
    { length: Math.min(VISIBLE, arrived) },
    (_, i) => arrived - 1 - i,
  );
  const chain = view === "chain";

  return (
    <div ref={rootRef} className={cn(panel, "w-full text-starlight")}>
      <div className="flex items-center justify-between gap-3 border-b border-starlight/10 px-5 py-3">
        <MonoLabel className="text-[11px] text-starlight/55">
          {chain ? "Block explorer" : "@dinar · your wallet"}
        </MonoLabel>
        <fieldset className={cn(segmentGroup, "shrink-0 flex-nowrap p-0.5")}>
          <legend className="sr-only">Whose view</legend>
          {(
            [
              ["you", "You"],
              ["chain", "Chain"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={cn(segmentButton, "min-h-8 px-3 text-xs")}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="px-5 pt-5 pb-4">
        <MonoLabel className="text-[11px] text-starlight/55">
          Shielded balance
        </MonoLabel>
        {chain ? (
          <p className="mt-2 flex items-center gap-2 text-2xl font-normal text-starlight/60">
            <Lock className="size-5" aria-hidden="true" /> Not on the chain
          </p>
        ) : (
          <p className="mt-2 text-[2.1rem] font-normal leading-none tracking-tight tabular-nums">
            {zatToZec(balance)}{" "}
            <span className="text-base text-starlight/60">ZEC</span>
          </p>
        )}
        <p className="mt-1.5 h-5 text-sm text-starlight/55">
          {chain
            ? "Only your keys can add it up."
            : (fiat.format(balance) ?? "")}
        </p>
      </div>

      <ul aria-label="Recent payments" className="grid list-none">
        {rows.map((n, i) => {
          const item = itemAt(n);
          const Icon = chain ? Lock : item.icon;
          return (
            <li
              key={n}
              className={cn(
                "flex items-center gap-3 border-t border-starlight/10 px-5 py-3",
                i === 0 && "motion-safe:animate-[mock-in_500ms_ease-out]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-9 shrink-0 place-items-center border",
                  chain
                    ? "border-starlight/10 text-starlight/45"
                    : "border-starlight/15 text-starlight",
                )}
              >
                <Icon className="size-4" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {chain ? "Shielded transaction" : item.title}
                </span>
                <span className="block truncate text-xs text-starlight/55">
                  {chain
                    ? `Block ${(START_BLOCK + n * 3).toLocaleString("en-US")} · fee paid`
                    : `“${item.memo}” · ${i === 0 ? "just now" : `${i * 2} min ago`}`}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm tabular-nums",
                  chain ? "text-starlight/60" : "text-(--signal-ink)",
                )}
              >
                {chain ? "hidden" : `+${zatToZec(item.zat)}`}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3 border-t border-starlight/10 py-1.5 pr-1.5 pl-5">
        <p className="flex min-w-0 flex-1 items-center gap-2 font-landing-mono text-[11px] text-starlight/55">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full bg-violet",
              running && "motion-safe:animate-pulse",
            )}
          />
          {chain
            ? "Visible: that it happened, its block and fee"
            : "Decrypted in this browser, never on a server"}
        </p>
        {reduceMotion ? null : (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play the demo" : "Pause the demo"}
            className="grid size-9 shrink-0 place-items-center rounded-full text-starlight/60 transition-colors hover:bg-starlight/5 hover:text-starlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            {paused ? (
              <Play className="size-3.5" aria-hidden="true" />
            ) : (
              <Pause className="size-3.5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
