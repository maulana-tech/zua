"use client";

import { CheckCircle2, Gift, Loader, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClaimStatus,
  type ClaimWallet,
  claimStatus,
  openClaimWallet,
  sweepClaim,
} from "../../features/claims/ephemeral";
import { type ClaimLink, parseClaimFragment } from "../../features/claims/link";
import { resolveRecipient } from "../../features/zcash/resolveRecipient";
import { isShielded } from "../../lib/zcash/address";
import { explorerTxUrl } from "../../lib/zcash/network";
import { zatToZec } from "../../lib/zcash/units";
import type { SendStage } from "../../lib/zcash/wallet";
import { api } from "../../trpc/client";
import { dashButtonPrimary, dashButtonSecondary } from "../dashboard/styles";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";

const STAGE: Record<SendStage, string> = {
  proposing: "Preparing…",
  proving: "Creating the zero-knowledge proof (10–60 s)…",
  broadcasting: "Sending to the Zcash network…",
};

/**
 * Public page for a claim link: opens the throwaway wallet in this browser
 * (the key never leaves it) and sweeps it into the claimer's wallet.
 */
export function ClaimView() {
  const { authenticated, username } = useWallet();
  const [link, setLink] = useState<ClaimLink | null>(null);
  const [linkError, setLinkError] = useState("");
  const wallet = useRef<ClaimWallet | null>(null);
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [to, setTo] = useState("");
  const [stage, setStage] = useState<SendStage | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ txid: string; amountZat: bigint } | null>(
    null,
  );

  useEffect(() => {
    try {
      setLink(parseClaimFragment(window.location.hash));
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Invalid claim link.");
    }
    return () => wallet.current?.wallet.close();
  }, []);

  // A signed-in Zua user can claim straight into their own wallet.
  useEffect(() => {
    if (!authenticated || !username) return;
    void api.profiles.me
      .query()
      .then((p) => {
        if (p?.ua) setTo((current) => current || `@${p.username}`);
      })
      .catch(() => {});
  }, [authenticated, username]);

  const check = useCallback(async () => {
    if (!link) return;
    setChecking(true);
    setError("");
    try {
      wallet.current ??= await openClaimWallet(link);
      setStatus(await claimStatus(wallet.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the link.");
    } finally {
      setChecking(false);
    }
  }, [link]);

  useEffect(() => {
    if (link) void check();
  }, [link, check]);

  // Funding takes a few blocks to confirm: keep checking while waiting.
  useEffect(() => {
    if (status?.kind !== "waiting" && status?.kind !== "pending") return;
    const id = window.setInterval(() => void check(), 30_000);
    return () => window.clearInterval(id);
  }, [status, check]);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.current) return;
    setError("");
    try {
      const recipient = await resolveRecipient(to);
      if (!isShielded(recipient.kind))
        throw new Error(
          "Claim to a shielded address so the payment stays private.",
        );
      const result = await sweepClaim(
        wallet.current,
        recipient.address,
        setStage,
      );
      setDone({ txid: result.txids[0], amountZat: result.amountZat });
      setStatus({ kind: "claimed" });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The claim didn't go through.",
      );
    } finally {
      setStage(null);
    }
  }

  return (
    <section
      className="w-full min-w-0 rounded-(--dash-radius) border border-(--dash-line-solid) bg-(--dash-surface) p-6 text-(--dash-fg) sm:p-8"
      aria-label="Claim a payment"
    >
      <p className="dashboard-tile-title">Zua claim link</p>
      {linkError ? (
        <div className="mt-5 grid gap-2" role="alert">
          <ShieldAlert className="size-6" aria-hidden="true" />
          <h1 className="text-2xl">This link can&apos;t be opened</h1>
          <p className="text-sm text-(--dash-ash)">{linkError}</p>
        </div>
      ) : !link ? (
        <p className="mt-5" role="status">
          Opening…
        </p>
      ) : (
        <>
          <h1 className="mt-5 flex items-center gap-3 text-3xl font-normal tracking-tight">
            <Gift className="size-7" aria-hidden="true" />
            {zatToZec(link.amountZat)} ZEC for you
          </h1>
          {link.description ? (
            <p className="mt-3 max-w-xl break-words text-sm text-(--dash-ash)">
              “{link.description}” (a note from the sender)
            </p>
          ) : null}
          <p className="mt-3 max-w-xl text-sm leading-6 text-(--dash-ash)">
            Someone sent you shielded ZEC in this link. Claim it into your own
            wallet; until then the sender can still take it back. Anyone with
            this link can claim it, so don&apos;t forward it.
          </p>

          <div
            aria-live="polite"
            className="mt-6 border-t border-(--dash-line) pt-6"
          >
            {done ? (
              <div className="grid gap-2">
                <p className="flex items-center gap-2 text-lg font-semibold">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                  Claimed {zatToZec(done.amountZat)} ZEC
                </p>
                <p className="text-sm text-(--dash-ash)">
                  It arrives in your wallet once the transaction is mined (a few
                  minutes).
                </p>
                <TxLink txid={done.txid} />
              </div>
            ) : checking && !status ? (
              <p className="flex items-center gap-2 text-sm" role="status">
                <Loader
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
                Looking up the payment on the Zcash network…
              </p>
            ) : status?.kind === "claimed" ? (
              <p className="text-sm">
                This link has already been claimed (or taken back by the
                sender).
              </p>
            ) : status?.kind === "waiting" || status?.kind === "pending" ? (
              <div className="grid gap-3">
                <p className="text-sm">
                  {status.kind === "waiting"
                    ? "The payment isn't on the network yet. The sender may still be sending it."
                    : `${zatToZec(status.amountZat)} ZEC is arriving: it can be claimed after a few confirmations.`}
                </p>
                <button
                  type="button"
                  className={`${dashButtonSecondary} justify-self-start`}
                  disabled={checking}
                  onClick={() => void check()}
                >
                  {checking ? "Checking…" : "Check again"}
                </button>
              </div>
            ) : status?.kind === "ready" ? (
              <form className="grid gap-3" onSubmit={(e) => void claim(e)}>
                <p className="text-sm">
                  {zatToZec(status.amountZat)} ZEC is ready. The network fee is
                  taken from it.
                </p>
                <label className="grid gap-1.5 text-sm font-medium">
                  Send it to
                  <Input
                    appearance="linen"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="@username or your shielded Zcash address (u1…)"
                    autoComplete="off"
                    disabled={stage !== null}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className={`${dashButtonPrimary} justify-self-start`}
                  disabled={stage !== null || !to.trim()}
                >
                  Claim
                </button>
                {stage ? (
                  <p className="flex items-center gap-2 text-sm text-(--dash-ash)">
                    <Loader
                      className="size-4 motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                    {STAGE[stage]}
                  </p>
                ) : null}
                {!authenticated ? (
                  <p className="text-xs text-(--dash-ash)">
                    No Zcash wallet yet? Sign up on Zua, or install Zodl, then
                    come back to this link.
                  </p>
                ) : null}
              </form>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function TxLink({ txid }: { txid: string }) {
  const url = explorerTxUrl(txid);
  return (
    <p className="break-all font-mono text-xs text-(--dash-ash)">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {txid}
        </a>
      ) : (
        txid
      )}
    </p>
  );
}
