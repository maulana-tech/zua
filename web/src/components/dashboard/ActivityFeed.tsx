"use client";

import { ArrowDownLeft, ArrowUpRight, Repeat } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HISTORY_PATH } from "../../lib/auth-routes";
import { parseMemoTag, sanitizeMemo } from "../../lib/zcash/memo";
import { explorerTxUrl } from "../../lib/zcash/network";
import { zatToZec } from "../../lib/zcash/units";
import type { WalletTx } from "../../lib/zcash/wallet";
import { MeawMascot } from "../MeawMascot";
import { dashFocus } from "./styles";

const TABS = ["All", "Received", "Sent"] as const;
type Tab = (typeof TABS)[number];

function describe(tx: WalletTx): string {
  for (const memo of tx.memos) {
    const tag = parseMemoTag(memo);
    if (tag?.kind === "inv") return "Invoice payment";
    if (tag?.kind === "link") return "Payment link";
    if (tag?.kind === "req") return "Request payment";
  }
  const note = tx.memos.map(sanitizeMemo).find((m) => m && !parseMemoTag(m));
  if (note) return note;
  return tx.kind === "received"
    ? "Received"
    : tx.kind === "sent"
      ? "Sent"
      : "Internal transfer";
}

function when(tx: WalletTx): string {
  if (tx.pending || tx.height === null) return "Confirming…";
  if (tx.timestamp)
    return new Date(tx.timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  return `Block ${tx.height.toLocaleString("en-US")}`;
}

export function ActivityFeed({
  history,
  loading,
  limit,
  showFilters = true,
  showSeeAll = false,
  title = "Activity",
}: {
  history: WalletTx[];
  loading: boolean;
  limit?: number;
  showFilters?: boolean;
  showSeeAll?: boolean;
  title?: string;
}) {
  const [tab, setTab] = useState<Tab>("All");
  const rows = useMemo(() => {
    const filtered = history.filter(
      (tx) =>
        tab === "All" ||
        (tab === "Received" ? tx.kind === "received" : tx.kind === "sent"),
    );
    return limit ? filtered.slice(0, limit) : filtered;
  }, [history, tab, limit]);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="dashboard-tile-title">{title}</h2>
        <div className="flex items-center gap-2">
          {showFilters ? (
            <fieldset className="flex items-center rounded-full border border-(--dash-line) p-0.5">
              <legend className="sr-only">Filter activity</legend>
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                  className={`h-8 rounded-full px-3.5 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors ${dashFocus} ${
                    tab === t
                      ? "bg-(--dash-fg) text-(--dash-surface)"
                      : "text-(--dash-ash) hover:text-(--dash-fg)"
                  }`}
                >
                  {t}
                </button>
              ))}
            </fieldset>
          ) : null}
          {showSeeAll ? (
            <Link
              href={HISTORY_PATH}
              className={`text-sm text-(--dash-ash) hover:text-(--dash-fg) ${dashFocus}`}
            >
              See all
            </Link>
          ) : null}
        </div>
      </div>

      {loading && history.length === 0 ? (
        <ul className="mt-5 grid gap-2" aria-label="Loading activity">
          {[0, 1, 2].map((k) => (
            <li
              key={k}
              className="h-12 rounded-(--dash-radius-sm) bg-(--dash-tint) motion-safe:animate-pulse"
            />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="py-10">
          <MeawMascot size={56} className="mb-4" />
          <p className="max-w-sm text-sm leading-6 text-(--dash-ash)">
            {tab === "All"
              ? "No payments yet. Share your payment link to receive your first."
              : `Nothing ${tab.toLowerCase()} yet.`}
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-(--dash-line)">
          {rows.map((tx) => {
            const Icon =
              tx.kind === "received"
                ? ArrowDownLeft
                : tx.kind === "sent"
                  ? ArrowUpRight
                  : Repeat;
            const url = explorerTxUrl(tx.txid);
            const amount = `${tx.value > 0n ? "+" : tx.value < 0n ? "−" : ""}${zatToZec(tx.value < 0n ? -tx.value : tx.value)} ZEC`;
            const body = (
              <>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--dash-tint)">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {describe(tx)}
                  </span>
                  <span className="block text-xs text-(--dash-ash)">
                    {when(tx)}
                  </span>
                </span>
                <span
                  className={`text-sm tabular-nums ${tx.value > 0n ? "text-(--dash-fg)" : "text-(--dash-ash)"}`}
                >
                  {amount}
                </span>
              </>
            );
            return (
              <li key={tx.txid}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 py-3 ${dashFocus}`}
                  >
                    {body}
                  </a>
                ) : (
                  <div className="flex items-center gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
