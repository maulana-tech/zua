"use client";

import { Download, X } from "lucide-react";
import { useMemo, useState } from "react";
import { receiptFilename } from "../../features/receipts/receipt";
import {
  filterHistory,
  type HistoryFilter,
  type HistoryKind,
  historyCsv,
  isFiltered,
  NO_FILTER,
} from "../../features/zcash/historyFilter";
import { useFiat } from "../../features/zcash/useZecPrice";
import { downloadText } from "../../lib/download";
import { unlockLabel } from "../../lib/passkey";
import { zatToZec } from "../../lib/zcash/units";
import { DatePicker } from "../ui/date-picker";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";
import { ActivityFeed } from "./ActivityFeed";
import { DashboardNotice } from "./DashboardNotice";
import { DashboardPageHeader } from "./DashboardPageHeader";
import { Segmented, type SegmentOption } from "./Segmented";
import { StatementPanel } from "./StatementPanel";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashLedger,
} from "./styles";

const KIND_OPTIONS: SegmentOption<HistoryKind>[] = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "sent", label: "Sent" },
];

export function HistoryDashboard() {
  const { accountUnlocked, promptUnlock, recoveryMethod, zcash, issueReceipt } =
    useWallet();
  const fiat = useFiat();
  const [receiptError, setReceiptError] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);
  const filtered = isFiltered(filter);
  const rows = useMemo(
    () => filterHistory(zcash.history, filter),
    [zcash.history, filter],
  );
  const totals = useMemo(() => {
    let received = 0n;
    let sent = 0n;
    for (const tx of rows) {
      if (tx.kind === "received") received += tx.value;
      if (tx.kind === "sent") sent += -tx.value;
    }
    return { received, sent, count: rows.length };
  }, [rows]);
  const set = (patch: Partial<HistoryFilter>) =>
    setFilter((f) => ({ ...f, ...patch }));
  function exportCsv() {
    const day = new Date().toISOString().slice(0, 10);
    downloadText(`zua-history-${day}.csv`, historyCsv(rows), "text/csv");
  }

  return (
    <>
      <DashboardPageHeader
        title="History"
        description="Every shielded payment in and out, decrypted on this device. Download a receipt for a payment you received, or a proof of payment for one you sent: each proves the amount on chain without revealing your other payments."
      />
      {accountUnlocked ? (
        <div className="grid gap-4">
          <dl className={`${dashLedger} sm:grid-cols-3`}>
            {[
              [
                filtered ? "Received (filtered)" : "Total received",
                totals.received,
              ],
              [filtered ? "Sent (filtered)" : "Total sent", totals.sent],
            ].map(([label, zat]) => (
              <div key={label as string} className={`${dashCell} p-5`}>
                <dt className="dashboard-tile-title">{label as string}</dt>
                <dd className="mt-3 text-2xl tabular-nums">
                  {zatToZec(zat as bigint)} ZEC
                </dd>
                <dd className="mt-1 text-xs text-(--dash-ash)">
                  {fiat.format(zat as bigint)}
                </dd>
              </div>
            ))}
            <div className={`${dashCell} p-5`}>
              <dt className="dashboard-tile-title">Transactions</dt>
              <dd className="mt-3 text-2xl tabular-nums">{totals.count}</dd>
              {filtered ? (
                <dd className="mt-1 text-xs text-(--dash-ash)">
                  of {zcash.history.length}
                </dd>
              ) : null}
            </div>
          </dl>
          <search className={dashLedger} aria-label="Filter payments">
            <div
              className={`${dashCell} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-end`}
            >
              <label className="grid gap-1.5 text-xs text-(--dash-ash) sm:col-span-2 lg:col-span-1">
                Search
                <Input
                  appearance="linen"
                  type="search"
                  value={filter.query}
                  onChange={(e) => set({ query: e.target.value })}
                  placeholder="Note, amount or transaction ID"
                />
              </label>
              <div className="grid gap-1.5 text-xs text-(--dash-ash)">
                <span id="history-kind-label">Type</span>
                <Segmented<HistoryKind>
                  aria-labelledby="history-kind-label"
                  className="lg:w-64"
                  value={filter.kind}
                  onChange={(kind) => set({ kind })}
                  options={KIND_OPTIONS}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:contents">
                <div className="grid gap-1.5 text-xs text-(--dash-ash)">
                  <span id="history-from-label">From</span>
                  <DatePicker
                    aria-labelledby="history-from-label"
                    className="lg:w-40"
                    placeholder="Any date"
                    clearable
                    value={filter.from}
                    max={filter.to || undefined}
                    onChange={(from) => set({ from })}
                  />
                </div>
                <div className="grid gap-1.5 text-xs text-(--dash-ash)">
                  <span id="history-to-label">To</span>
                  <DatePicker
                    aria-labelledby="history-to-label"
                    className="lg:w-40"
                    placeholder="Any date"
                    clearable
                    value={filter.to}
                    min={filter.from || undefined}
                    onChange={(to) => set({ to })}
                  />
                </div>
              </div>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                {filtered ? (
                  <button
                    type="button"
                    className={dashButtonSecondary}
                    onClick={() => setFilter(NO_FILTER)}
                  >
                    <X aria-hidden="true" />
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  className={dashButtonSecondary}
                  onClick={exportCsv}
                  disabled={!rows.length}
                  title="Spreadsheet of the payments shown below"
                >
                  <Download aria-hidden="true" />
                  CSV
                </button>
              </div>
            </div>
          </search>
          {receiptBusy ? (
            <p className="text-sm text-(--dash-ash)" aria-live="polite">
              Building the proof from the chain…
            </p>
          ) : receiptError ? (
            <p className="text-sm text-destructive" role="alert">
              {receiptError}
            </p>
          ) : null}
          <div className={dashLedger}>
            <div className={dashCell}>
              <ActivityFeed
                history={rows}
                showFilters={false}
                emptyMessage={
                  filtered && zcash.history.length
                    ? "No payments match these filters."
                    : undefined
                }
                loading={
                  zcash.status === "loading" || zcash.status === "syncing"
                }
                onReceipt={async (tx) => {
                  if (receiptBusy) return;
                  setReceiptError("");
                  setReceiptBusy(true);
                  let receipt: Awaited<ReturnType<typeof issueReceipt>>;
                  try {
                    receipt = await issueReceipt(tx);
                  } catch (e) {
                    setReceiptError(
                      e instanceof Error
                        ? e.message
                        : "Couldn't build the receipt.",
                    );
                    return;
                  } finally {
                    setReceiptBusy(false);
                  }
                  downloadText(
                    receiptFilename(receipt),
                    JSON.stringify(receipt, null, 2),
                    "application/json",
                  );
                }}
              />
            </div>
          </div>
          <div className={dashLedger}>
            <StatementPanel />
          </div>
        </div>
      ) : (
        <DashboardNotice
          label="Locked"
          title="Unlock to view history"
          action={
            <button
              type="button"
              className={dashButtonPrimary}
              onClick={promptUnlock}
            >
              {unlockLabel(recoveryMethod)}
            </button>
          }
        >
          Your payment records are encrypted on the blockchain. Only this
          device, after you unlock, can read them.
        </DashboardNotice>
      )}
    </>
  );
}
