"use client";

import { AlertTriangle, ArrowUpRight, Loader } from "lucide-react";
import { useState } from "react";
import {
  type Recipient,
  resolveRecipient,
} from "../../features/zcash/resolveRecipient";
import { formatUsd, useZecPrice } from "../../features/zcash/useZecPrice";
import { unlockLabel } from "../../lib/passkey";
import { isShielded } from "../../lib/zcash/address";
import { MAX_MEMO_BYTES, memoBytes } from "../../lib/zcash/memo";
import { explorerTxUrl } from "../../lib/zcash/network";
import { zatToZec, zecToZat } from "../../lib/zcash/units";
import { Mascot } from "../Mascot";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";
import { DashboardNotice } from "./DashboardNotice";
import { DashboardPageHeader } from "./DashboardPageHeader";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashLedger,
} from "./styles";

// ZIP-317 fee for a simple shielded send (two logical actions). The wallet
// computes the exact fee when it builds the transaction.
const ESTIMATED_FEE_ZAT = 10_000n;

type Stage =
  | "idle"
  | "review"
  | "proposing"
  | "proving"
  | "broadcasting"
  | "done";

export function SendDashboard() {
  const { accountUnlocked, promptUnlock, recoveryMethod, zcash, send } =
    useWallet();
  const price = useZecPrice();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [txids, setTxids] = useState<string[]>([]);

  const spendable = zcash.balances?.spendable ?? 0n;

  async function review(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const r = await resolveRecipient(to);
      const zat = amount.trim() ? zecToZat(amount) : r.amountZat;
      if (!zat || zat <= 0n) throw new Error("Enter an amount to send.");
      if (zat + ESTIMATED_FEE_ZAT > spendable)
        throw new Error(
          "Not enough shielded balance for this amount plus the network fee.",
        );
      const note = memo.trim() || r.memo || "";
      if (note && !isShielded(r.kind))
        throw new Error(
          "Transparent addresses can't receive a note. Remove it to continue.",
        );
      if (memoBytes(note) > MAX_MEMO_BYTES)
        throw new Error("The note is too long.");
      if (!amount.trim()) setAmount(zatToZec(zat));
      if (!memo.trim() && r.memo) setMemo(r.memo);
      setRecipient(r);
      setAcknowledged(isShielded(r.kind));
      setStage("review");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check the details and try again.",
      );
    }
  }

  async function confirm() {
    if (!recipient) return;
    setError("");
    try {
      const ids = await send({
        to: recipient.address,
        amountZat: zecToZat(amount),
        memo: memo.trim() || undefined,
        onStage: setStage,
      });
      setTxids(ids);
      setStage("done");
    } catch (cause) {
      setStage("review");
      setError(
        cause instanceof Error
          ? cause.message
          : "The payment failed. Nothing was sent.",
      );
    }
  }

  function reset() {
    setTo("");
    setAmount("");
    setMemo("");
    setRecipient(null);
    setTxids([]);
    setStage("idle");
    setError("");
  }

  if (!accountUnlocked)
    return (
      <>
        <DashboardPageHeader
          title="Send"
          description="Pay a @username or any Zcash address from your shielded balance."
        />
        <DashboardNotice
          label="Locked"
          title="Unlock to send"
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
          Payments are built and proved on this device with your keys.
        </DashboardNotice>
      </>
    );

  const busy =
    stage === "proposing" || stage === "proving" || stage === "broadcasting";

  return (
    <>
      <DashboardPageHeader
        title="Send"
        description="Pay a @username or any Zcash address. Shielded payments hide the sender, recipient and amount."
      />
      <div
        className={`${dashLedger} lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]`}
      >
        <section className={`${dashCell} p-6`} aria-label="Payment details">
          {stage === "done" ? (
            <div className="grid justify-items-start gap-4 py-6">
              <Mascot mood="success" size={72} />
              <h2 className="text-2xl tracking-tight">Sent {amount} ZEC</h2>
              <p className="text-sm text-(--dash-ash)">
                {recipient?.username ? `To @${recipient.username}. ` : ""}It
                confirms in about a minute.
              </p>
              {txids.map((id) => {
                const url = explorerTxUrl(id);
                return url ? (
                  <a
                    key={id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-mono text-xs underline underline-offset-2"
                  >
                    {id}
                  </a>
                ) : (
                  <code key={id} className="break-all text-xs">
                    {id}
                  </code>
                );
              })}
              <button
                type="button"
                className={dashButtonSecondary}
                onClick={reset}
              >
                Send another
              </button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={review}>
              <label className="grid gap-1.5 text-sm font-medium">
                To
                <Input
                  appearance="linen"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setStage("idle");
                  }}
                  placeholder="@dinar, u1…, or a zcash: payment link"
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Amount (ZEC)
                <Input
                  appearance="linen"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^\d.]/g, ""));
                    setStage("idle");
                  }}
                  placeholder="0.25"
                  disabled={busy}
                />
                <span className="text-xs font-normal text-(--dash-ash)">
                  Available: {zatToZec(spendable)} ZEC{" "}
                  {formatUsd(spendable, price)}
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Note (optional, encrypted)
                <Input
                  appearance="linen"
                  value={memo}
                  maxLength={300}
                  onChange={(e) => {
                    setMemo(e.target.value);
                    setStage("idle");
                  }}
                  placeholder="Only the recipient can read this"
                  disabled={busy}
                />
              </label>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {stage === "idle" ? (
                <button
                  type="submit"
                  className={`${dashButtonPrimary} justify-self-start`}
                >
                  Review payment
                </button>
              ) : null}
            </form>
          )}
        </section>

        <aside className={`${dashCell} p-6`} aria-label="Review">
          <h2 className="dashboard-tile-title">Review</h2>
          {recipient && stage !== "idle" && stage !== "done" ? (
            <div className="mt-5 grid gap-4 text-sm">
              <dl className="grid gap-3">
                <div>
                  <dt className="text-(--dash-ash)">To</dt>
                  <dd className="mt-1 break-all">
                    {recipient.username
                      ? `@${recipient.username} · verified`
                      : recipient.address}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--dash-ash)">Amount</dt>
                  <dd className="mt-1 tabular-nums">
                    {amount} ZEC {formatUsd(zecToZat(amount), price)}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--dash-ash)">Network fee (estimate)</dt>
                  <dd className="mt-1 tabular-nums">
                    {zatToZec(ESTIMATED_FEE_ZAT)} ZEC
                  </dd>
                </div>
                <div>
                  <dt className="text-(--dash-ash)">Privacy</dt>
                  <dd className="mt-1">
                    {isShielded(recipient.kind)
                      ? "Shielded: sender, recipient and amount stay private."
                      : "Transparent: this payment leaves the shielded pool."}
                  </dd>
                </div>
              </dl>
              {!isShielded(recipient.kind) ? (
                <label className="flex items-start gap-2 rounded-(--dash-radius-sm) border border-(--dash-line-strong) p-3">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="flex-1">
                    The amount and destination will be public on the blockchain.
                    Use this for cash-outs to an exchange.
                  </span>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    aria-label="I understand this payment is public"
                    className="mt-0.5 size-4"
                  />
                </label>
              ) : null}
              <button
                type="button"
                className={`${dashButtonPrimary} justify-self-start`}
                onClick={confirm}
                disabled={busy || !acknowledged}
                aria-busy={busy}
              >
                {busy ? (
                  <Loader
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowUpRight aria-hidden="true" />
                )}
                {stage === "proposing"
                  ? "Preparing…"
                  : stage === "proving"
                    ? "Proving (~10 s)…"
                    : stage === "broadcasting"
                      ? "Broadcasting…"
                      : "Send now"}
              </button>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-(--dash-ash)">
              Enter the details, then review. Your wallet builds a
              zero-knowledge proof on this device before anything is sent.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
