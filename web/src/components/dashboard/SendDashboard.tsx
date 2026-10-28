"use client";

import { AlertTriangle, ArrowUpRight, Loader, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CONTACTS_RECORD,
  type Contact,
  contactKey,
  contactLabel,
  contactTarget,
  forgetContact,
  MAX_CONTACT_NAME,
  matchContacts,
  nameContact,
  recordPayment,
} from "../../features/contacts/contacts";
import {
  type Recipient,
  resolveRecipient,
} from "../../features/zcash/resolveRecipient";
import { useFiat } from "../../features/zcash/useZecPrice";
import { unlockLabel } from "../../lib/passkey";
import { isShielded } from "../../lib/zcash/address";
import { MAX_MEMO_BYTES, memoBytes, parseMemoTag } from "../../lib/zcash/memo";
import { explorerTxUrl } from "../../lib/zcash/network";
import { zatToZec, zecToZat } from "../../lib/zcash/units";
import type { Proposed } from "../../lib/zcash/wallet";
import { trpc } from "../../trpc/react";
import { Mascot } from "../Mascot";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";
import { DashboardNotice } from "./DashboardNotice";
import { DashboardPageHeader } from "./DashboardPageHeader";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashFocus,
  dashLedger,
} from "./styles";

// ZIP-317 minimum fee (two logical actions), for a quick balance check. The
// review shows the exact fee of the transaction the wallet builds, which is
// higher when change is split into several notes.
const MIN_FEE_ZAT = 10_000n;
const NOT_ENOUGH =
  "Not enough shielded balance for this amount plus the network fee.";
const SHOWN_CONTACTS = 6;

type Stage =
  | "idle"
  | "review"
  | "proposing"
  | "proving"
  | "broadcasting"
  | "done";

export function SendDashboard() {
  const {
    accountUnlocked,
    promptUnlock,
    recoveryMethod,
    zcash,
    proposePayments,
    proveProposal,
    loadLocal,
    saveLocal,
  } = useWallet();
  const fiat = useFiat();
  const params = useSearchParams();
  const requestId = params.get("request");
  const markPaid = trpc.requests.markPaid.useMutation();
  const [to, setTo] = useState(params.get("to") ?? "");
  const [amount, setAmount] = useState(params.get("amount") ?? "");
  const [memo, setMemo] = useState(params.get("memo") ?? "");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [proposed, setProposed] = useState<Proposed | null>(null);
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [txids, setTxids] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactSaved, setContactSaved] = useState(false);

  useEffect(() => {
    if (!accountUnlocked) return;
    let alive = true;
    loadLocal<Contact[]>(CONTACTS_RECORD)
      .catch(() => null)
      .then((saved) => alive && setContacts(saved ?? []));
    return () => {
      alive = false;
    };
  }, [accountUnlocked, loadLocal]);

  function updateContacts(next: Contact[]) {
    setContacts(next);
    // A device-only convenience: a failed save just means no suggestion later.
    void saveLocal(CONTACTS_RECORD, next).catch(() => {});
  }

  const spendable = zcash.balances?.spendable ?? 0n;

  async function review(e: React.FormEvent) {
    e.preventDefault();
    if (checking) return;
    setError("");
    setChecking(true);
    try {
      const r = await resolveRecipient(to);
      const zat = amount.trim() ? zecToZat(amount) : r.amountZat;
      if (!zat || zat <= 0n) throw new Error("Enter an amount to send.");
      if (zat + MIN_FEE_ZAT > spendable) throw new Error(NOT_ENOUGH);
      const note = memo.trim() || r.memo || "";
      if (note && !isShielded(r.kind))
        throw new Error(
          "Transparent addresses can't receive a note. Remove it to continue.",
        );
      if (memoBytes(note) > MAX_MEMO_BYTES)
        throw new Error("The note is too long.");
      // Built now (not proved) so the review shows the exact fee.
      const next = await proposePayments([
        { to: r.address, amountZat: zat, memo: note || undefined },
      ]).catch((cause) => {
        throw /insufficient/i.test(String(cause))
          ? new Error(NOT_ENOUGH)
          : cause;
      });
      if (!amount.trim()) setAmount(zatToZec(zat));
      if (!memo.trim() && r.memo) setMemo(r.memo);
      setProposed(next);
      setRecipient(r);
      setAcknowledged(isShielded(r.kind));
      setStage("review");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check the details and try again.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    if (!recipient || !proposed) return;
    setError("");
    try {
      const ids = await proveProposal(proposed, setStage);
      setTxids(ids);
      setStage("done");
      // An address from a tagged invoice/sale link pays that one bill, so it
      // isn't someone to pay again.
      const oneOff = !recipient.username && parseMemoTag(memo) !== null;
      if (ids.length && !oneOff) {
        updateContacts(recordPayment(contacts, recipient, Date.now()));
        setContactName(
          contacts.find((c) => c.key === contactKey(recipient))?.name ?? "",
        );
        setContactSaved(false);
      }
      if (requestId && ids.length)
        void markPaid.mutateAsync({ id: requestId }).catch(() => {});
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
    setProposed(null);
    setTxids([]);
    setStage("idle");
    setError("");
    setContactName("");
    setContactSaved(false);
  }

  function pick(contact: Contact) {
    setTo(contactTarget(contact));
    setStage("idle");
    document.getElementById("send-amount")?.focus();
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
                confirms in about a minute; the block explorer link below works
                once it has.
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
              {recipient &&
              !recipient.username &&
              contacts.some((c) => c.key === contactKey(recipient)) ? (
                <form
                  className="grid w-full max-w-sm gap-1.5 text-sm font-medium"
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateContacts(
                      nameContact(contacts, contactKey(recipient), contactName),
                    );
                    setContactSaved(true);
                  }}
                >
                  <label htmlFor="contact-name">
                    Name this address (optional)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="contact-name"
                      appearance="linen"
                      value={contactName}
                      maxLength={MAX_CONTACT_NAME}
                      onChange={(e) => {
                        setContactName(e.target.value);
                        setContactSaved(false);
                      }}
                      placeholder="My exchange"
                    />
                    <button type="submit" className={dashButtonSecondary}>
                      {contactSaved ? "Saved" : "Save"}
                    </button>
                  </div>
                  <span className="text-xs font-normal text-(--dash-ash)">
                    Kept only on this device, so you can pick it next time.
                  </span>
                </form>
              ) : null}
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
              <RecentContacts
                contacts={matchContacts(contacts, to)
                  .filter((c) => contactTarget(c) !== to.trim())
                  .slice(0, SHOWN_CONTACTS)}
                disabled={busy}
                onPick={pick}
                onForget={(c) => updateContacts(forgetContact(contacts, c.key))}
              />
              <label className="grid gap-1.5 text-sm font-medium">
                Amount (ZEC)
                <Input
                  id="send-amount"
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
                  Available: {zatToZec(spendable)} ZEC {fiat.format(spendable)}
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
                  disabled={checking}
                >
                  {checking ? "Checking…" : "Review payment"}
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
                    {amount} ZEC {fiat.format(zecToZat(amount))}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--dash-ash)">Network fee</dt>
                  <dd className="mt-1 tabular-nums">
                    {zatToZec(proposed?.feeZat ?? 0n)} ZEC
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

function RecentContacts({
  contacts,
  disabled,
  onPick,
  onForget,
}: {
  contacts: Contact[];
  disabled: boolean;
  onPick: (contact: Contact) => void;
  onForget: (contact: Contact) => void;
}) {
  if (!contacts.length) return null;
  return (
    <div className="-mt-1 grid gap-2">
      <p className="text-xs text-(--dash-ash)">Recent</p>
      <ul className="flex flex-wrap gap-2">
        {contacts.map((c) => (
          <li
            key={c.key}
            className="flex h-8 items-center rounded-full border border-(--dash-line-strong) text-xs"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(c)}
              title={c.username ? undefined : c.address}
              className={`h-full max-w-48 truncate rounded-l-full pr-1.5 pl-3 hover:text-(--dash-fg) ${dashFocus}`}
            >
              {contactLabel(c)}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onForget(c)}
              aria-label={`Forget ${contactLabel(c)}`}
              className={`flex h-full items-center rounded-r-full pr-2.5 pl-1 text-(--dash-ash) hover:text-(--dash-fg) ${dashFocus}`}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
