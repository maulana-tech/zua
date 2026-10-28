"use client";

import { useState } from "react";
import { utcDay } from "../../features/receipts/build";
import { receiptCsv, receiptFilename } from "../../features/receipts/receipt";
import { downloadText } from "../../lib/download";
import { zatToZec } from "../../lib/zcash/units";
import { DatePicker } from "../ui/date-picker";
import { useWallet } from "../WalletProvider";
import { dashButtonPrimary, dashButtonSecondary, dashCell } from "./styles";

const firstOfMonth = () => `${utcDay(Date.now()).slice(0, 8)}01`;

/**
 * A signed statement of every payment received in a period: each one is
 * proven on chain by /verify, without opening the rest of the wallet.
 */
export function StatementPanel() {
  const { issueStatement } = useWallet();
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(() => utcDay(Date.now()));
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [last, setLast] = useState<Awaited<
    ReturnType<typeof issueStatement>
  > | null>(null);

  async function build() {
    setError("");
    setLast(null);
    if (from > to) return setError("The start date is after the end date.");
    setProgress("Reading payments from the chain…");
    try {
      const statement = await issueStatement(from, to, (done, total) =>
        setProgress(`Reading payments from the chain… ${done}/${total}`),
      );
      setLast(statement);
      downloadText(
        receiptFilename(statement),
        JSON.stringify(statement, null, 2),
        "application/json",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't build the statement.",
      );
    } finally {
      setProgress(null);
    }
  }

  return (
    <section className={`${dashCell} p-5`} aria-labelledby="statement-title">
      <h2 id="statement-title" className="dashboard-tile-title">
        Income statement
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-(--dash-ash)">
        For an accountant or a tax filing: one signed file listing every payment
        you received in a period, with the total. Anyone can check it at
        /verify; it reveals those payments only, not your balance or anything
        else.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5 text-sm font-medium">
          <span id="statement-from-label">From</span>
          <DatePicker
            aria-labelledby="statement-from-label"
            className="w-44"
            value={from}
            max={to}
            onChange={setFrom}
          />
        </div>
        <div className="grid gap-1.5 text-sm font-medium">
          <span id="statement-to-label">To</span>
          <DatePicker
            aria-labelledby="statement-to-label"
            className="w-44"
            value={to}
            min={from}
            onChange={setTo}
          />
        </div>
        <button
          type="button"
          className={dashButtonPrimary}
          disabled={progress !== null}
          onClick={() => void build()}
        >
          Download statement
        </button>
        {last ? (
          <button
            type="button"
            className={dashButtonSecondary}
            onClick={() =>
              downloadText(
                receiptFilename(last).replace(/\.json$/, ".csv"),
                receiptCsv(last),
                "text/csv",
              )
            }
          >
            Also as CSV
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-sm" aria-live="polite">
        {progress ? (
          <span className="text-(--dash-ash)">{progress}</span>
        ) : error ? (
          <span className="text-destructive" role="alert">
            {error}
          </span>
        ) : last ? (
          <span className="text-(--dash-ash)">
            {last.items.length} payments, {zatToZec(BigInt(last.totalZat))} ZEC
            in total.
          </span>
        ) : null}
      </p>
    </section>
  );
}
