"use client";

import { Copy, Gift, Loader, Share2, Undo2 } from "lucide-react";
import { useState } from "react";
import {
  claimAddress,
  claimStatus,
  openClaimWallet,
  sweepClaim,
} from "../../features/claims/ephemeral";
import { CLAIM_SWEEP_FEE_ZAT, claimLinkUrl } from "../../features/claims/link";
import { formatUsd, useZecPrice } from "../../features/zcash/useZecPrice";
import { unlockLabel } from "../../lib/passkey";
import { memoBytes } from "../../lib/zcash/memo";
import { zatToZec, zecToZat } from "../../lib/zcash/units";
import type { SendStage } from "../../lib/zcash/wallet";
import type { ClaimLinkView } from "../../server/modules/claimLinks/claimLinks.schema";
import { trpc } from "../../trpc/react";
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

const STAGE: Record<SendStage, string> = {
  proposing: "Building the transaction…",
  proving: "Creating the zero-knowledge proof (10–60 s)…",
  broadcasting: "Broadcasting…",
};

/** Send ZEC as a link anyone can claim; take it back while unclaimed. */
export function ClaimLinksDashboard() {
  const {
    accountUnlocked,
    promptUnlock,
    recoveryMethod,
    zcash,
    send,
    claimKey,
  } = useWallet();
  const price = useZecPrice();
  const utils = trpc.useUtils();
  const list = trpc.claimLinks.list.useQuery(undefined, {
    enabled: accountUnlocked,
  });
  const create = trpc.claimLinks.create.useMutation();
  const markFunded = trpc.claimLinks.markFunded.useMutation();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<SendStage | "preparing" | null>(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const urlFor = (l: ClaimLinkView) =>
    claimLinkUrl(window.location.origin, {
      key: claimKey(l.index),
      amountZat: BigInt(l.amountZat),
      birthday: l.birthday,
      description: l.description,
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreated(null);
    let amountZat: bigint;
    try {
      amountZat = zecToZat(amount);
    } catch {
      return setError("Enter an amount like 0.1.");
    }
    if (amountZat <= 0n) return setError("Enter an amount.");
    if (memoBytes(note) > 200) return setError("The note is too long.");
    if (
      amountZat + CLAIM_SWEEP_FEE_ZAT * 2n >
      (zcash.balances?.spendable ?? 0n)
    )
      return setError("Not enough shielded balance for this amount and fees.");
    setStage("preparing");
    try {
      const { ZcashWallet } = await import("../../lib/zcash/wallet");
      // The link wallet scans from here; the funding lands just after.
      const birthday = (await ZcashWallet.latestBlock()) - 1;
      const link = await create.mutateAsync({
        amountZat: amountZat.toString(),
        description: note.trim(),
        birthday,
      });
      const cw = await openClaimWallet({ key: claimKey(link.index), birthday });
      const to = await claimAddress(cw);
      cw.wallet.close();
      // Fund it with the amount plus the fee the claimer pays to sweep it.
      const [txid] = await send({
        to,
        amountZat: amountZat + CLAIM_SWEEP_FEE_ZAT,
        memo: note.trim() || undefined,
        onStage: setStage,
      });
      const funded = await markFunded.mutateAsync({ id: link.id, txid });
      setCreated(urlFor(funded));
      setAmount("");
      setNote("");
      void utils.claimLinks.list.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't create the link.",
      );
      void utils.claimLinks.list.invalidate();
    } finally {
      setStage(null);
    }
  }

  if (!accountUnlocked)
    return (
      <>
        <DashboardPageHeader
          title="Claim links"
          description="Send ZEC to anyone as a link."
        />
        <DashboardNotice
          label="Locked"
          title="Unlock to send claim links"
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
          A claim link is funded from your shielded balance.
        </DashboardNotice>
      </>
    );

  return (
    <>
      <DashboardPageHeader
        title="Claim links"
        description="Send ZEC to someone who doesn't have a Zcash address yet: share a link over any private chat, they claim it into their own wallet. Until they do, you can take it back."
      />
      <div className="grid gap-4">
        <div className={dashLedger}>
          <section className={`${dashCell} p-5`} aria-label="New claim link">
            <form className="grid gap-4" onSubmit={(e) => void submit(e)}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
                <label className="grid gap-1.5 text-sm font-medium">
                  Amount (ZEC)
                  <Input
                    appearance="linen"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^\d.]/g, ""))
                    }
                    placeholder="0.1"
                    disabled={stage !== null}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Note (in the link, optional)
                  <Input
                    appearance="linen"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Happy birthday!"
                    maxLength={200}
                    disabled={stage !== null}
                  />
                </label>
              </div>
              <p className="text-xs text-(--dash-ash)">
                {amount
                  ? (() => {
                      try {
                        const zat = zecToZat(amount) + CLAIM_SWEEP_FEE_ZAT;
                        return `You send ${zatToZec(zat)} ZEC (${formatUsd(zat, price)}), which includes the fee the claimer pays to move it, plus the network fee for this transaction.`;
                      } catch {
                        return "";
                      }
                    })()
                  : "The link holds the key to the funds: anyone who has it can claim them."}
              </p>
              <button
                type="submit"
                className={`${dashButtonPrimary} justify-self-start`}
                disabled={stage !== null || !amount}
              >
                <Gift aria-hidden="true" /> Create link
              </button>
              {stage ? (
                <p
                  className="flex items-center gap-2 text-sm text-(--dash-ash)"
                  aria-live="polite"
                >
                  <Loader
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  {stage === "preparing"
                    ? "Preparing the link wallet…"
                    : STAGE[stage]}
                </p>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {created ? (
                <div className="grid gap-2 rounded-(--dash-radius-sm) border border-(--dash-line-strong) p-3">
                  <p className="text-sm font-semibold">
                    Link ready. Send it over a private chat:
                  </p>
                  <p className="break-all font-mono text-xs">{created}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={dashButtonSecondary}
                      onClick={() => {
                        void navigator.clipboard?.writeText(created);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      <Copy aria-hidden="true" />{" "}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    {typeof navigator !== "undefined" &&
                    "share" in navigator ? (
                      <button
                        type="button"
                        className={dashButtonSecondary}
                        onClick={() =>
                          void navigator
                            .share({ title: "ZEC for you", url: created })
                            .catch(() => {})
                        }
                      >
                        <Share2 aria-hidden="true" /> Share
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-(--dash-ash)">
                    It can be claimed once the funding has a few confirmations.
                  </p>
                </div>
              ) : null}
            </form>
          </section>
        </div>

        <div className={dashLedger}>
          <section className={`${dashCell} p-5`} aria-label="Your claim links">
            <h2 className="dashboard-tile-title">Your links</h2>
            {list.isLoading ? (
              <p className="mt-3 text-sm text-(--dash-ash)">Loading…</p>
            ) : !list.data?.length ? (
              <p className="mt-3 text-sm text-(--dash-ash)">No links yet.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {list.data.map((l) => (
                  <ClaimLinkRow
                    key={l.id}
                    link={l}
                    url={() => urlFor(l)}
                    keyFor={claimKey}
                    myAddress={zcash.address}
                    onCancelled={() => void utils.claimLinks.list.invalidate()}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function ClaimLinkRow({
  link,
  url,
  keyFor,
  myAddress,
  onCancelled,
}: {
  link: ClaimLinkView;
  url: () => string;
  keyFor: (index: number) => Uint8Array;
  myAddress: string | null;
  onCancelled: () => void;
}) {
  const cancel = trpc.claimLinks.cancel.useMutation();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function withWallet<T>(
    fn: (cw: Awaited<ReturnType<typeof openClaimWallet>>) => Promise<T>,
  ) {
    setBusy(true);
    setMessage("Checking the link on the Zcash network…");
    const cw = await openClaimWallet({
      key: keyFor(link.index),
      birthday: link.birthday,
    });
    try {
      return await fn(cw);
    } finally {
      cw.wallet.close();
      setBusy(false);
    }
  }

  async function check() {
    try {
      const s = await withWallet(claimStatus);
      setMessage(
        s.kind === "ready"
          ? `Unclaimed: ${zatToZec(s.amountZat)} ZEC waiting.`
          : s.kind === "pending"
            ? "Funding is confirming."
            : s.kind === "claimed"
              ? "Claimed."
              : "Not funded (yet).",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't check it.");
    }
  }

  async function takeBack() {
    if (!myAddress) return setMessage("Wait for your wallet to load.");
    try {
      const result = await withWallet(async (cw) => {
        const s = await claimStatus(cw);
        if (s.kind === "claimed")
          return "Already claimed: nothing to take back.";
        if (s.kind !== "ready")
          return "Nothing spendable yet. Try again after a few confirmations.";
        setMessage("Taking it back (proving takes 10–60 s)…");
        const { amountZat } = await sweepClaim(cw, myAddress);
        return `Took back ${zatToZec(amountZat)} ZEC.`;
      });
      setMessage(result);
      if (result.startsWith("Took back")) {
        await cancel.mutateAsync({ id: link.id });
        onCancelled();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't take it back.");
    }
  }

  return (
    <li className="rounded-(--dash-radius-sm) border border-(--dash-line) p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="tabular-nums">
          {zatToZec(BigInt(link.amountZat))} ZEC
          {link.description ? (
            <span className="text-(--dash-ash)"> · {link.description}</span>
          ) : null}
        </span>
        <span className="text-xs text-(--dash-ash)">
          {link.state === "cancelled"
            ? "Taken back"
            : link.state === "funding"
              ? "Not funded"
              : "Sent"}{" "}
          · {new Date(link.createdAt).toLocaleDateString()}
        </span>
      </div>
      {link.state !== "cancelled" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={dashButtonSecondary}
            onClick={() => {
              void navigator.clipboard?.writeText(url());
              setMessage("Link copied.");
            }}
          >
            <Copy aria-hidden="true" /> Copy link
          </button>
          <button
            type="button"
            className={dashButtonSecondary}
            disabled={busy}
            onClick={() => void check()}
          >
            Check status
          </button>
          <button
            type="button"
            className={dashButtonSecondary}
            disabled={busy}
            onClick={() => void takeBack()}
          >
            <Undo2 aria-hidden="true" /> Take back
          </button>
        </div>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-(--dash-ash)" aria-live="polite">
          {message}
        </p>
      ) : null}
    </li>
  );
}
