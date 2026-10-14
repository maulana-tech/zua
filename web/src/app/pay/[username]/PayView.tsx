"use client";

import { Loader, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { dashButtonSecondary } from "../../../components/dashboard/styles";
import { MeawMascot } from "../../../components/MeawMascot";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { QrPanel } from "../../../components/zcash/QrPanel";
import { formatUsd, useZecPrice } from "../../../features/zcash/useZecPrice";
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
}: {
  username: string;
  slug?: string;
}) {
  const profile = trpc.profiles.byUsername.useQuery({ username }, { retry: 1 });
  const link = trpc.paymentLinks.resolve.useQuery(
    { owner: username, slug: slug ?? "" },
    { enabled: Boolean(slug), retry: 1 },
  );
  const ping = trpc.notifications.paymentPing.useMutation();
  const price = useZecPrice();
  const [amount, setAmount] = useState("");
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
        className="grid place-items-center py-16"
        role="status"
        aria-label="Loading payment page"
      >
        <Loader
          className="size-8 motion-safe:animate-spin"
          aria-hidden="true"
        />
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

  if (!claim)
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
          address: claim.ua,
          amountZat,
          memo,
          label: `@${username} on ${APP_NAME}`,
          message: link.data?.title,
        });

  return (
    <>
      <section className="grid gap-2 pt-4">
        <h1 className="text-3xl font-bold">
          {link.data ? link.data.title : `Pay @${username}`}
        </h1>
        <p className="text-sm opacity-70">
          {link.data?.description ??
            "Your payment is shielded: only @" +
              username +
              " can see who paid and how much."}
        </p>
        <p className="inline-flex items-center gap-1.5 text-xs opacity-70">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Address signed by @{username}
        </p>
      </section>

      <Card appearance="glass" density="spacious" className="gap-4">
        {paid ? (
          <div
            className="grid justify-items-center gap-3 py-6 text-center"
            role="status"
          >
            <MeawMascot mood="success" size={72} tone="white" />
            <h2 className="text-xl font-semibold">
              Thanks! @{username} has been told.
            </h2>
            <p className="text-sm opacity-70">
              The payment shows up once their wallet syncs. Nothing about it was
              shared with us.
            </p>
          </div>
        ) : (
          <>
            {fixedZat ? (
              <p className="text-2xl font-semibold tabular-nums">
                {link.data?.amountZec} ZEC{" "}
                <span className="text-sm font-normal opacity-70">
                  {formatUsd(fixedZat, price)}
                </span>
              </p>
            ) : (
              <label className="grid gap-1.5 text-sm font-medium">
                Amount (ZEC)
                <Input
                  appearance="glass"
                  inputMode="decimal"
                  placeholder="0.25"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  aria-invalid={amountZat === null}
                />
                {typeof amountZat === "bigint" ? (
                  <span className="text-xs font-normal opacity-70">
                    {formatUsd(amountZat, price)}
                  </span>
                ) : null}
              </label>
            )}
            <label className="grid gap-1.5 text-sm font-medium">
              Note for @{username} (optional, encrypted)
              <Input
                appearance="glass"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Invoice #12"
              />
            </label>
            {uri ? (
              <QrPanel uri={uri} copyText={claim.ua} />
            ) : (
              <p className="text-sm text-destructive">
                Enter a ZEC amount with up to 8 decimals.
              </p>
            )}
            <p className="text-xs opacity-70">
              Scan with Zodl or any Zcash wallet that supports shielded
              payments. Fees are a fraction of a cent.
            </p>
            <button
              type="button"
              className={dashButtonSecondary}
              disabled={ping.isPending}
              onClick={async () => {
                await ping
                  .mutateAsync({ username, nonce: newMemoId() })
                  .catch(() => {});
                setPaid(true);
              }}
            >
              I&apos;ve paid
            </button>
          </>
        )}
      </Card>
      <p className="pt-3 text-center text-xs opacity-60">
        Shielded by Zcash · private by default ·{" "}
        {network === "main" ? "mainnet" : "testnet"}
      </p>
    </>
  );
}
