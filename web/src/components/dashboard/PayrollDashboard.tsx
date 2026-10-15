"use client";

import { AlertTriangle, Loader, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  MAX_PAYROLL_ROWS,
  type PayrollRow,
  parsePayrollCsv,
  payrollCsv,
} from "../../features/payroll/csv";
import {
  type Recipient,
  resolveRecipient,
} from "../../features/zcash/resolveRecipient";
import { formatUsd, useZecPrice } from "../../features/zcash/useZecPrice";
import { downloadText } from "../../lib/download";
import { unlockLabel } from "../../lib/passkey";
import { isShielded } from "../../lib/zcash/address";
import { MAX_MEMO_BYTES, memoBytes } from "../../lib/zcash/memo";
import { explorerTxUrl } from "../../lib/zcash/network";
import { zatToZec, zecToZat } from "../../lib/zcash/units";
import type { Proposed, SendStage } from "../../lib/zcash/wallet";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";
import { DashboardNotice } from "./DashboardNotice";
import { DashboardPageHeader } from "./DashboardPageHeader";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashIconButton,
  dashLedger,
} from "./styles";

type Row = PayrollRow & { id: number };
type Resolved = { row: Row; recipient: Recipient; amountZat: bigint };
type Stage = "edit" | "review" | SendStage | "done";

let nextId = 1;
const blankRow = (): Row => ({
  id: nextId++,
  recipient: "",
  amount: "",
  memo: "",
});

const STAGE_LABEL: Partial<Record<Stage, string>> = {
  proposing: "Building the transaction…",
  proving: "Creating the zero-knowledge proof (10–60 s)…",
  broadcasting: "Broadcasting to the Zcash network…",
};

/** Pays many people in one shielded transaction (ZIP-321 multi-payment). */
export function PayrollDashboard() {
  const {
    accountUnlocked,
    promptUnlock,
    recoveryMethod,
    zcash,
    proposePayments,
    proveProposal,
  } = useWallet();
  const price = useZecPrice();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow()]);
  const [stage, setStage] = useState<Stage>("edit");
  const [resolved, setResolved] = useState<Resolved[]>([]);
  const [proposed, setProposed] = useState<Proposed | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [txids, setTxids] = useState<string[]>([]);

  const busy =
    stage === "proposing" || stage === "proving" || stage === "broadcasting";
  const transparent = resolved.filter((r) => !isShielded(r.recipient.kind));

  function edit(id: number, key: keyof PayrollRow, value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    setStage("edit");
    setProposed(null);
  }

  async function importCsv(f: File) {
    setError("");
    try {
      const parsed = parsePayrollCsv(await f.text());
      setRows(parsed.map((r) => ({ ...r, id: nextId++ })));
      setStage("edit");
      setProposed(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  async function review(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const filled = rows.filter((r) => r.recipient.trim() || r.amount.trim());
    if (filled.length < 1) return setError("Add at least one payment.");
    setStage("proposing");
    try {
      const out: Resolved[] = [];
      for (const [i, row] of filled.entries()) {
        const where = `Row ${i + 1}`;
        let recipient: Recipient;
        try {
          recipient = await resolveRecipient(row.recipient);
        } catch (cause) {
          throw new Error(
            `${where}: ${cause instanceof Error ? cause.message : "invalid recipient"}`,
          );
        }
        let amountZat: bigint;
        try {
          amountZat = zecToZat(row.amount);
        } catch {
          throw new Error(`${where}: enter an amount like 0.25.`);
        }
        if (amountZat <= 0n) throw new Error(`${where}: enter an amount.`);
        if (row.memo && !isShielded(recipient.kind))
          throw new Error(`${where}: transparent addresses can't get a note.`);
        if (memoBytes(row.memo) > MAX_MEMO_BYTES)
          throw new Error(`${where}: the note is too long.`);
        out.push({ row, recipient, amountZat });
      }
      const p = await proposePayments(
        out.map((r) => ({
          to: r.recipient.address,
          amountZat: r.amountZat,
          memo: r.row.memo,
        })),
      );
      setResolved(out);
      setProposed(p);
      setAcknowledged(out.every((r) => isShielded(r.recipient.kind)));
      setStage("review");
    } catch (cause) {
      setStage("edit");
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't build this batch. Check your shielded balance.",
      );
    }
  }

  async function pay() {
    if (!proposed) return;
    setError("");
    try {
      setTxids(await proveProposal(proposed, setStage));
      setStage("done");
    } catch (cause) {
      setStage("review");
      setProposed(null);
      setError(
        `${cause instanceof Error ? cause.message : "The payment failed."} Review again before retrying.`,
      );
    }
  }

  if (!accountUnlocked)
    return (
      <>
        <DashboardPageHeader
          title="Payroll"
          description="Pay your team in one shielded transaction."
        />
        <DashboardNotice
          label="Locked"
          title="Unlock to pay your team"
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
          Payroll is paid from your shielded balance, signed on this device.
        </DashboardNotice>
      </>
    );

  return (
    <>
      <DashboardPageHeader
        title="Payroll"
        description={`Pay up to ${MAX_PAYROLL_ROWS} people in one shielded transaction. Each person sees only their own payment and note; outsiders see neither the amounts nor who was paid.`}
      />
      <div className={dashLedger}>
        <section className={`${dashCell} p-5`} aria-label="Payments">
          {stage === "done" ? (
            <div className="grid gap-3" aria-live="polite">
              <h2 className="text-lg font-semibold">
                Paid {resolved.length} people
              </h2>
              <p className="text-sm text-(--dash-ash)">
                {zatToZec(proposed?.sendZat ?? 0n)} ZEC plus a{" "}
                {zatToZec(proposed?.feeZat ?? 0n)} ZEC network fee. Download a
                proof of payment for anyone from History once it is mined.
              </p>
              <ul className="grid gap-1 font-mono text-xs break-all">
                {txids.map((id) => {
                  const url = explorerTxUrl(id);
                  return (
                    <li key={id}>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                        >
                          {id}
                        </a>
                      ) : (
                        id
                      )}
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className={`${dashButtonSecondary} justify-self-start`}
                onClick={() => {
                  setRows([blankRow(), blankRow()]);
                  setResolved([]);
                  setProposed(null);
                  setTxids([]);
                  setStage("edit");
                }}
              >
                New batch
              </button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={(e) => void review(e)}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={dashButtonSecondary}
                  onClick={() => file.current?.click()}
                  disabled={busy}
                >
                  <Upload aria-hidden="true" /> Import CSV
                </button>
                <button
                  type="button"
                  className={dashButtonSecondary}
                  onClick={() =>
                    downloadText(
                      "zua-payroll.csv",
                      payrollCsv(
                        rows.some((r) => r.recipient)
                          ? rows
                          : [
                              {
                                recipient: "@username",
                                amount: "0.5",
                                memo: "October",
                              },
                            ],
                      ),
                      "text/csv",
                    )
                  }
                >
                  Export CSV
                </button>
                <input
                  ref={file}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  aria-label="Import payroll CSV"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) void importCsv(f);
                  }}
                />
                <span className="text-xs text-(--dash-ash)">
                  Columns: recipient (@username, address or zcash: link), amount
                  in ZEC, note.
                </span>
              </div>
              <ol className="grid gap-3">
                {rows.map((row, i) => (
                  <li
                    key={row.id}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_auto] sm:items-end"
                  >
                    <label className="grid gap-1 text-xs font-medium">
                      {i + 1}. Recipient
                      <Input
                        appearance="linen"
                        value={row.recipient}
                        onChange={(e) =>
                          edit(row.id, "recipient", e.target.value)
                        }
                        placeholder="@dinar or u1…"
                        autoComplete="off"
                        disabled={busy}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium">
                      Amount (ZEC)
                      <Input
                        appearance="linen"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) =>
                          edit(
                            row.id,
                            "amount",
                            e.target.value.replace(/[^\d.]/g, ""),
                          )
                        }
                        placeholder="0.5"
                        disabled={busy}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium">
                      Note (private)
                      <Input
                        appearance="linen"
                        value={row.memo}
                        onChange={(e) => edit(row.id, "memo", e.target.value)}
                        placeholder="October salary"
                        disabled={busy}
                      />
                    </label>
                    <button
                      type="button"
                      className={dashIconButton}
                      aria-label={`Remove row ${i + 1}`}
                      disabled={busy || rows.length === 1}
                      onClick={() => {
                        setRows((rs) => rs.filter((r) => r.id !== row.id));
                        setStage("edit");
                        setProposed(null);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className={`${dashButtonSecondary} justify-self-start`}
                disabled={busy || rows.length >= MAX_PAYROLL_ROWS}
                onClick={() => setRows((rs) => [...rs, blankRow()])}
              >
                <Plus aria-hidden="true" /> Add person
              </button>

              {stage === "review" && proposed ? (
                <div className="grid gap-3 border-t border-(--dash-line) pt-4">
                  <h2 className="text-lg font-semibold">Review</h2>
                  <ul className="grid gap-1 text-sm">
                    {resolved.map((r) => (
                      <li key={r.row.id} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {r.recipient.username
                            ? `@${r.recipient.username} (verified)`
                            : `${r.recipient.address.slice(0, 18)}…`}
                        </span>
                        <span className="tabular-nums">
                          {zatToZec(r.amountZat)} ZEC
                        </span>
                      </li>
                    ))}
                  </ul>
                  <dl className="grid gap-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-(--dash-ash)">Network fee</dt>
                      <dd className="tabular-nums">
                        {zatToZec(proposed.feeZat)} ZEC
                      </dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <dt>Total</dt>
                      <dd className="tabular-nums">
                        {zatToZec(proposed.sendZat + proposed.feeZat)} ZEC ·{" "}
                        {formatUsd(proposed.sendZat + proposed.feeZat, price)}
                      </dd>
                    </div>
                  </dl>
                  {transparent.length ? (
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      <span>
                        <AlertTriangle
                          className="mr-1 inline size-4"
                          aria-hidden="true"
                        />
                        {transparent.length} recipient
                        {transparent.length > 1 ? "s use" : " uses"} a
                        transparent address: those payments and amounts will be
                        public.
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {busy ? (
                <p
                  className="flex items-center gap-2 text-sm text-(--dash-ash)"
                  aria-live="polite"
                >
                  <Loader
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  {STAGE_LABEL[stage]}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {stage === "review" && proposed ? (
                  <button
                    type="button"
                    className={dashButtonPrimary}
                    disabled={!acknowledged}
                    onClick={() => void pay()}
                  >
                    Pay {resolved.length} people
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={dashButtonPrimary}
                    disabled={busy}
                  >
                    Review batch
                  </button>
                )}
              </div>
              <p className="text-xs text-(--dash-ash)">
                Spendable now: {zatToZec(zcash.balances?.spendable ?? 0n)} ZEC.
              </p>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
