import { toCsv } from "../../lib/csv";
import { sanitizeMemo } from "../../lib/zcash/memo";
import { zatToZec } from "../../lib/zcash/units";
import type { WalletTx } from "../../lib/zcash/wallet";
import { describeTx } from "./describeTx";

export type HistoryKind = "all" | "received" | "sent";

export type HistoryFilter = {
  query: string;
  kind: HistoryKind;
  /** Local calendar days, "YYYY-MM-DD"; empty for no bound. */
  from: string;
  to: string;
};

export const NO_FILTER: HistoryFilter = {
  query: "",
  kind: "all",
  from: "",
  to: "",
};

export function isFiltered(f: HistoryFilter): boolean {
  return Boolean(f.query.trim() || f.kind !== "all" || f.from || f.to);
}

const dayStart = (day: string) => new Date(`${day}T00:00:00`).getTime();

/**
 * Payments matching the search (label, note, amount or txid), kind and days.
 * Unconfirmed payments have no time yet, so a date range leaves them out.
 */
export function filterHistory(
  history: WalletTx[],
  f: HistoryFilter,
): WalletTx[] {
  const q = f.query.trim().toLowerCase();
  const from = f.from ? dayStart(f.from) : null;
  const to = f.to ? dayStart(f.to) + 86_400_000 : null;
  return history.filter((tx) => {
    if (f.kind !== "all" && tx.kind !== f.kind) return false;
    if (from !== null || to !== null) {
      if (!tx.timestamp) return false;
      if (from !== null && tx.timestamp < from) return false;
      if (to !== null && tx.timestamp >= to) return false;
    }
    if (!q) return true;
    const amount = zatToZec(tx.value < 0n ? -tx.value : tx.value);
    return (
      describeTx(tx).toLowerCase().includes(q) ||
      tx.memos.some((m) => sanitizeMemo(m).toLowerCase().includes(q)) ||
      amount.startsWith(q) ||
      tx.txid.startsWith(q)
    );
  });
}

/** Spreadsheet export; amounts in ZEC, negative for money out. */
export function historyCsv(rows: WalletTx[]): string {
  return toCsv([
    [
      "date",
      "type",
      "amount_zec",
      "fee_zec",
      "description",
      "memo",
      "status",
      "block",
      "txid",
    ],
    ...rows.map((tx) => [
      tx.timestamp ? new Date(tx.timestamp).toISOString() : "",
      tx.kind,
      zatToZec(tx.value),
      tx.fee === null ? "" : zatToZec(tx.fee),
      describeTx(tx),
      tx.memos.map(sanitizeMemo).filter(Boolean).join(" | "),
      tx.pending || tx.height === null ? "confirming" : "confirmed",
      tx.height === null ? "" : String(tx.height),
      tx.txid,
    ]),
  ]);
}
