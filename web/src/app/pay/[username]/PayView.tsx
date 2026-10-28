"use client";

import { Loader, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import {
  dashButtonSecondary,
  dashCell,
  dashLedger,
} from "../../../components/dashboard/styles";
import { Mascot } from "../../../components/Mascot";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { QrPanel } from "../../../components/zcash/QrPanel";
import { postToParent, useEmbedBridge } from "../../../features/embed/bridge";
import { useFiat } from "../../../features/zcash/useZecPrice";
import { verifiedAddress } from "../../../lib/addressClaim";
import { APP_NAME } from "../../../lib/brand";
import { verifyClaim } from "../../../lib/profileClaim";
import { formatMemoTag, newMemoId } from "../../../lib/zcash/memo";
import { network } from "../../../lib/zcash/network";
import { zecToZat } from "../../../lib/zcash/units";
import { buildPaymentUri } from "../../../lib/zcash/zip321";
import { trpc } from "../../../trpc/react";

/** Public payment page: a verified ZIP-321 QR for @username (or one link). */
export function PayView({
  username,
  slug,
  embed = false,
  initialAmount,
}: {
  username: string;
  slug?: string;
  /** Rendered inside a merchant's site via /embed (public/embed.js). */
  embed?: boolean;
  /** Prefilled amount (ZEC) for open-amount pages, e.g. from the embed. */
  initialAmount?: string;
}) {
  useEmbedBridge(embed);
  const profile = trpc.profiles.byUsername.useQuery({ username }, { retry: 1 });
  const link = trpc.paymentLinks.resolve.useQuery(
    { owner: username, slug: slug ?? "" },
    { enabled: Boolean(slug), retry: 1 },
  );
  const ping = trpc.notifications.paymentPing.useMutation();
  const fiat = useFiat();
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(false);

  const claim = useMemo(() => {
    if (!profile.data) return null;
    const c = verifyClaim(profile.data.claimJson, profile.data.claimSigHex);
    return c &&
      c.username === username &&
      c.ua === profile.data.ua &&
      c.network === network
      ? c
      : null;
  }, [profile.data, username]);

  // A link may have its own (signed) address; plain profile pages use the
  // profile address.
  const payTo = useMemo(
    () => (claim ? verifiedAddress(claim, link.data?.payAddress) : null),
    [claim, link.data?.payAddress],
  );

  const fixedZat = link.data?.amountZat ? BigInt(link.data.amountZat) : null;
  const amountZat = useMemo(() => {
    if (fixedZat) return fixedZat;
    try {
      return amount.trim() ? zecToZat(amount) : undefined;
    } catch {
      return null;
    }
  }, [amount, fixedZat]);

  if (profile.isLoading || (slug && link.isLoading))
    return (
      <div
        className="grid gap-5 motion-safe:animate-pulse"
        role="status"
        aria-label="Loading payment page"
      >
        <div className="grid gap-3 pt-4">
          <div className="h-9 w-56 rounded-(--dash-radius-sm) bg-(--dash-tint)" />
          <div className="h-4 w-80 max-w-full rounded-(--dash-radius-sm) bg-(--dash-tint)" />
        </div>
        <div className={`${dashLedger} @container`}>
          <div
            className={`${dashCell} grid gap-4 p-5 @xl:grid-cols-[minmax(0,1fr)_16rem] sm:p-6`}
          >
            <div className="grid content-start gap-3">
              <div className="h-3 w-16 rounded-full bg-(--dash-tint)" />
              <div className="h-14 rounded-(--dash-radius-sm) bg-(--dash-tint)" />
              <div className="h-3 w-24 rounded-full bg-(--dash-tint)" />
              <div className="h-10 rounded-(--dash-radius-sm) bg-(--dash-tint)" />
            </div>
            <div className="mx-auto aspect-square w-full max-w-64 rounded-(--dash-radius-sm) bg-(--dash-tint)" />
          </div>
        </div>
      </div>
    );

  if (!profile.data || (slug && !link.data))
    return (
      <Card appearance="glass" className="gap-3 p-6">
        <h1 className="text-lg font-semibold">
          {profile.data ? "Payment link unavailable" : `@${username} not found`}
        </h1>
        <p className="text-sm opacity-70">
          {profile.data
            ? "This link may have been archived or mistyped."
            : `No ${APP_NAME} account uses this username.`}
        </p>
      </Card>
    );

  if (!claim || !payTo)
    return (
      <Card appearance="glass" className="gap-3 p-6" role="alert">
        <ShieldAlert className="size-6" aria-hidden="true" />
        <h1 className="text-lg font-semibold">
          This address could not be verified
        </h1>
        <p className="text-sm opacity-70">
          The address on file for @{username} isn&apos;t signed by its owner.
          Don&apos;t pay it. Ask them for a fresh link.
        </p>
      </Card>
    );

  const tag = link.data
    ? formatMemoTag({ kind: "link", id: link.data.id })
    : "";
  const memo = [tag, note.trim()].filter(Boolean).join(" ") || undefined;
  const uri =
    amountZat === null
      ? null
      : buildPaymentUri({
          address: payTo,
          amountZat,
          memo,
          label: `@${username} on ${APP_NAME}`,
          message: link.data?.title,
        });

  const amountInvalid = amountZat === null;

  return (
    <>
      <section className="grid gap-2 pt-4">
        <p className="dashboard-tile-title">
          {link.data ? `@${username} · payment link` : "Shielded payment"}
        </p>
        <h1 className="text-[clamp(1.9rem,4vw,2.6rem)] leading-tight tracking-tight">
          {link.data ? link.data.title : `Pay @${username}`}
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-(--dash-ash)">
          {link.data?.description ??
            `Only @${username} can see who paid and how much. Nobody else, us included.`}
        </p>
        <p className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-(--dash-line-strong) px-3 py-1 text-xs font-medium">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Address signed by @{username}
        </p>
      </section>

      {paid ? (
        <div className={dashLedger}>
          <div
            className={`${dashCell} grid justify-items-center gap-3 px-6 py-10 text-center`}
            role="status"
          >
            <Mascot mood="success" size={72} tone="white" />
            <h2 className="text-xl font-semibold">
              Thanks! @{username} has been told.
            </h2>
            <p className="max-w-sm text-sm text-(--dash-ash)">
              The payment shows up once their wallet syncs. Nothing about it was
              shared with us.
            </p>
          </div>
        </div>
      ) : (
        <div className="@container">
          <div
            className={`${dashLedger} @xl:grid-cols-[minmax(0,1fr)_minmax(0,18.5rem)] @xl:grid-rows-[auto_1fr]`}
          >
            <div className={`${dashCell} grid content-start gap-5 p-5 sm:p-6`}>
              {fixedZat ? (
                <div className="grid gap-1">
                  <span className="dashboard-tile-title">Amount</span>
                  <p className="text-[clamp(1.75rem,5vw,2.25rem)] leading-tight tabular-nums">
                    {link.data?.amountZec}{" "}
                    <span className="text-base font-semibold tracking-[0.08em] text-(--dash-ash)">
                      ZEC
                    </span>
                  </p>
                  <p className="text-sm text-(--dash-ash) tabular-nums">
                    {fiat.format(fixedZat)}
                  </p>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <label htmlFor="pay-amount" className="dashboard-tile-title">
                    Amount
                  </label>
                  <div className="relative">
                    <Input
                      id="pay-amount"
                      appearance="linen"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      className="h-14 pr-16 text-2xl tabular-nums md:text-2xl"
                      value={amount}
                      onChange={(e) =>
                        setAmount(
                          e.target.value
                            .replace(",", ".")
                            .replace(/[^\d.]/g, ""),
                        )
                      }
                      aria-invalid={amountInvalid}
                      aria-describedby="pay-amount-hint"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold tracking-[0.08em] text-(--dash-ash)">
                      ZEC
                    </span>
                  </div>
                  <p
                    id="pay-amount-hint"
                    className={`text-xs tabular-nums ${amountInvalid ? "text-destructive" : "text-(--dash-ash)"}`}
                  >
                    {amountInvalid
                      ? "Use a ZEC amount with up to 8 decimals, like 0.25."
                      : typeof amountZat === "bigint"
                        ? fiat.format(amountZat)
                        : "Optional: leave it empty to type it in your wallet."}
                  </p>
                </div>
              )}
              <div className="grid gap-1.5">
                <label htmlFor="pay-note" className="dashboard-tile-title">
                  Note for @{username}
                </label>
                <Input
                  id="pay-note"
                  appearance="linen"
                  className="h-11"
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Invoice #12"
                  aria-describedby="pay-note-hint"
                />
                <p id="pay-note-hint" className="text-xs text-(--dash-ash)">
                  Optional. Sent encrypted in the payment memo.
                </p>
              </div>
            </div>

            <div
              className={`${dashCell} p-5 sm:p-6 @xl:col-start-2 @xl:row-span-2 @xl:row-start-1`}
            >
              {uri ? (
                <QrPanel uri={uri} copyText={payTo} />
              ) : (
                <div className="mx-auto grid aspect-square w-full max-w-64 place-items-center rounded-(--dash-radius-sm) border border-dashed border-(--dash-line-strong) p-6 text-center text-sm text-(--dash-ash)">
                  Fix the amount to get the payment code.
                </div>
              )}
            </div>

            <div className={`${dashCell} grid content-start gap-4 p-5 sm:p-6`}>
              <ol className="grid gap-2 text-sm text-(--dash-ash)">
                {[
                  "Scan the code with Zodl or any Zcash wallet with shielded payments, or open it in a wallet on this device.",
                  "Check the amount and send. The fee is a fraction of a cent.",
                  `Tap “I've paid” so @${username} knows to look.`,
                ].map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full border border-(--dash-line-strong) text-[11px] font-semibold text-(--dash-fg) tabular-nums">
                      {i + 1}
                    </span>
                    <span className="leading-5">{step}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className={`${dashButtonSecondary} w-full @xl:w-fit`}
                disabled={ping.isPending}
                onClick={async () => {
                  await ping
                    .mutateAsync({ username, nonce: newMemoId() })
                    .catch(() => {});
                  setPaid(true);
                  postToParent({ type: "zua:payer-says-paid" });
                }}
              >
                {ping.isPending ? (
                  <Loader
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                I&apos;ve paid
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="pt-1 text-center text-xs text-(--dash-ash)">
        Shielded by Zcash · private by default ·{" "}
        {network === "main" ? "mainnet" : "testnet"}
      </p>
    </>
  );
}
