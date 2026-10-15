"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { invoiceStatus } from "../../features/invoices/input";
import { centsToUsd, usdToCents } from "../../features/invoices/money";
import type { InvoiceView } from "../../features/invoices/types";
import { formatUsd, useZecPrice } from "../../features/zcash/useZecPrice";
import { verifiedAddress } from "../../lib/addressClaim";
import { APP_NAME } from "../../lib/brand";
import { downloadInvoicePdf } from "../../lib/invoicePdf";
import { verifyClaim } from "../../lib/profileClaim";
import { formatMemoTag } from "../../lib/zcash/memo";
import { network } from "../../lib/zcash/network";
import { zatToZec, zecToZat } from "../../lib/zcash/units";
import { buildPaymentUri } from "../../lib/zcash/zip321";
import { api } from "../../trpc/client";
import { BackLink } from "../BackLink";
import { DashboardBackground } from "../dashboard/DashboardBackground";
import { dashButtonSecondary, dashCell } from "../dashboard/styles";
import { Mascot } from "../Mascot";
import { QrPanel } from "../zcash/QrPanel";

export const invoiceDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const LABELS = {
  pending: "Awaiting payment",
  paid: "Paid",
  void: "Void",
  overdue: "Overdue",
} as const;

/** Public invoice page: verified ZIP-321 QR tagged with the invoice memo. */
export function InvoiceCheckout({ token }: { token: string }) {
  const price = useZecPrice();
  const [downloading, setDownloading] = useState(false);
  const query = useQuery({
    queryKey: ["public-invoice", token],
    queryFn: () => api.invoices.public.query({ token }),
    // The owner's wallet reports payments; poll so the payer sees "Paid".
    refetchInterval: (q) =>
      q.state.data?.status === "pending" ? 20_000 : false,
    retry: 1,
  });
  const profile = useQuery({
    queryKey: ["invoice-owner", query.data?.username],
    enabled: Boolean(query.data?.username),
    queryFn: () =>
      api.profiles.byUsername.query({ username: query.data?.username ?? "" }),
  });
  // USD invoices: lock a ZEC amount for 30 minutes, and re-lock when it
  // expires while the page is open (until a payment freezes it).
  const [quoted, setQuoted] = useState<InvoiceView | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const polled = query.data ?? null;
  // Whichever is newer: the polled invoice (payments, status) or the quote.
  const invoice = useMemo(
    () =>
      polled &&
      quoted &&
      polled.status === "pending" &&
      (polled.quote?.expiresAt ?? "") < (quoted.quote?.expiresAt ?? "")
        ? {
            ...polled,
            quote: quoted.quote,
            totalZat: quoted.totalZat,
            totalZec: quoted.totalZec,
          }
        : (polled ?? quoted),
    [polled, quoted],
  );
  const needsQuote =
    invoice?.currency === "USD" &&
    invoice.status === "pending" &&
    invoice.paidZat === "0" &&
    (!invoice.quote || Date.parse(invoice.quote.expiresAt) <= Date.now());
  useEffect(() => {
    if (!needsQuote) return;
    let cancelled = false;
    api.invoices.quote
      .mutate({ token })
      .then((v) => {
        if (!cancelled && v) {
          setQuoted(v);
          setQuoteError("");
        }
      })
      .catch((e) => {
        if (!cancelled)
          setQuoteError(
            e instanceof Error ? e.message : "Couldn't get the ZEC amount.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [needsQuote, token]);
  const quoteExpiry = invoice?.quote?.expiresAt;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!quoteExpiry) return;
    const ms = Date.parse(quoteExpiry) - Date.now();
    if (ms <= 0) return;
    const id = window.setTimeout(() => tick((n) => n + 1), ms + 500);
    return () => window.clearTimeout(id);
  }, [quoteExpiry]);

  const ua = useMemo(() => {
    if (!profile.data || !invoice) return null;
    const claim = verifyClaim(profile.data.claimJson, profile.data.claimSigHex);
    return claim &&
      claim.username === invoice.username &&
      claim.network === network &&
      claim.ua === profile.data.ua
      ? // The invoice's own address, if it has one, checked against the profile key.
        verifiedAddress(claim, invoice.payAddress)
      : null;
  }, [profile.data, invoice]);

  const remaining = invoice
    ? BigInt(invoice.totalZat) - BigInt(invoice.paidZat)
    : 0n;
  // The memo tag is what marks the invoice paid, so copy the whole ZIP-321
  // link (address, amount, memo), not just the address.
  const payUri =
    ua && invoice
      ? buildPaymentUri({
          address: ua,
          amountZat: remaining,
          memo: formatMemoTag({ kind: "inv", id: invoice.id }),
          label: `@${invoice.username} on ${APP_NAME}`,
          message: `Invoice ${invoice.number}`,
        })
      : "";
  const state = invoice ? invoiceStatus(invoice.status, invoice.dueDate) : null;

  return (
    <DashboardBackground>
      <main
        id="main-content"
        className="mx-auto min-h-svh max-w-5xl px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6"
      >
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BackLink />
            <Link href="/" aria-label={`${APP_NAME} home`}>
              <Image
                src="/assets/zua-white.svg"
                alt={APP_NAME}
                width={40}
                height={40}
                className="size-10"
              />
            </Link>
          </div>
          <p className="text-xs text-(--dash-ash)">
            Zcash {network === "main" ? "mainnet" : "testnet"} invoice
          </p>
        </header>

        {!invoice ? (
          query.isError || (query.isSuccess && !query.data) ? (
            <section
              role="alert"
              className={`${dashCell} border border-(--dash-line) p-6`}
            >
              <h1 className="text-xl">Invoice unavailable</h1>
              <p className="my-3 text-sm text-(--dash-ash)">
                The link may be invalid, or the service could not be reached.
              </p>
              <button
                type="button"
                className={dashButtonSecondary}
                onClick={() => void query.refetch()}
              >
                Try again
              </button>
            </section>
          ) : (
            <p role="status">Loading invoice…</p>
          )
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <article
              className={`${dashCell} border border-(--dash-line-solid) p-5 sm:p-8`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="dashboard-tile-title">
                    Invoice from @{invoice.username}
                  </p>
                  <h1 className="mt-3 break-all text-3xl font-normal tracking-tight">
                    {invoice.number}
                  </h1>
                </div>
                <span className="rounded-full border border-(--dash-line) px-3 py-1 text-sm">
                  {state ? LABELS[state] : ""}
                </span>
              </div>
              <dl className="my-7 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-(--dash-ash)">Bill to</dt>
                  <dd className="mt-1 break-words font-medium">
                    {invoice.clientName}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--dash-ash)">Due date (UTC)</dt>
                  <dd className="mt-1">{invoiceDate(invoice.dueDate)}</dd>
                </div>
              </dl>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Invoice line items</caption>
                  <thead className="border-y border-(--dash-line) text-(--dash-ash)">
                    <tr>
                      <th className="py-3 font-normal" scope="col">
                        Description
                      </th>
                      <th className="px-3 py-3 font-normal" scope="col">
                        Qty
                      </th>
                      <th className="py-3 text-right font-normal" scope="col">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, read-only list
                        key={`${i}-${item.description}`}
                        className="border-b border-(--dash-line)"
                      >
                        <td className="min-w-32 break-words py-4">
                          {item.description}
                        </td>
                        <td className="px-3 py-4 tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-4 text-right tabular-nums">
                          {invoice.currency === "USD"
                            ? centsToUsd(
                                usdToCents(item.unitPrice) *
                                  BigInt(item.quantity),
                              )
                            : `${zatToZec(
                                zecToZat(item.unitPrice) *
                                  BigInt(item.quantity),
                              )} ZEC`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-6 flex items-baseline justify-between gap-4 text-lg">
                <span>Total</span>
                <span className="tabular-nums">
                  {invoice.currency === "USD" ? (
                    invoice.totalUsd
                  ) : (
                    <>
                      {invoice.totalZec} ZEC{" "}
                      <span className="text-sm text-(--dash-ash)">
                        {formatUsd(BigInt(invoice.totalZat), price)}
                      </span>
                    </>
                  )}
                </span>
              </p>
              {invoice.notes ? (
                <p className="mt-6 whitespace-pre-wrap text-sm text-(--dash-ash)">
                  {invoice.notes}
                </p>
              ) : null}
              <button
                type="button"
                className={`${dashButtonSecondary} mt-6`}
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadInvoicePdf(invoice, {
                      origin: window.location.origin,
                    });
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                <Download aria-hidden="true" />
                {downloading
                  ? "Preparing…"
                  : invoice.status === "paid"
                    ? "Download receipt"
                    : "Download PDF"}
              </button>
            </article>

            <aside
              className={`${dashCell} border border-(--dash-line-solid) p-5 sm:p-6`}
              aria-label="Pay this invoice"
            >
              {invoice.status === "paid" ? (
                <div className="grid justify-items-start gap-3" role="status">
                  <Mascot mood="success" size={72} />
                  <h2 className="text-xl">Paid. Thank you!</h2>
                  <p className="text-sm text-(--dash-ash)">
                    @{invoice.username}&apos;s wallet found your payment.
                    Nothing about it is public.
                  </p>
                </div>
              ) : invoice.status === "void" ? (
                <p className="text-sm text-(--dash-ash)">
                  This invoice was voided. Ask @{invoice.username} for a new
                  one.
                </p>
              ) : invoice.currency === "USD" &&
                (!invoice.quote || remaining <= 0n) ? (
                <p className="text-sm text-(--dash-ash)" role="status">
                  {quoteError || "Locking the ZEC amount at the current rate…"}
                </p>
              ) : !ua ? (
                profile.isLoading ? (
                  <p role="status">Checking the address…</p>
                ) : (
                  <div className="grid gap-2" role="alert">
                    <ShieldAlert className="size-6" aria-hidden="true" />
                    <p className="text-sm">
                      The payee&apos;s address could not be verified. Don&apos;t
                      pay this invoice.
                    </p>
                  </div>
                )
              ) : (
                <div className="grid gap-4">
                  <h2 className="dashboard-tile-title">
                    Pay with any Zcash wallet
                  </h2>
                  <p className="text-2xl tabular-nums">
                    {zatToZec(remaining)} ZEC{" "}
                    <span className="text-sm text-(--dash-ash)">
                      {formatUsd(remaining, price)}
                    </span>
                  </p>
                  {invoice.currency === "USD" && invoice.quote ? (
                    <p className="text-xs text-(--dash-ash)">
                      {invoice.totalUsd} at $
                      {invoice.quote.usdPerZec.toFixed(2)}/ZEC
                      {invoice.paidZat === "0"
                        ? `, locked until ${new Date(invoice.quote.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : ", locked by your first payment"}
                      .
                    </p>
                  ) : null}
                  {invoice.paidZat !== "0" ? (
                    <p className="text-xs text-(--dash-ash)">
                      {zatToZec(BigInt(invoice.paidZat))} ZEC already received.
                    </p>
                  ) : null}
                  <QrPanel
                    uri={payUri}
                    copyText={payUri}
                    copyLabel="Copy payment link"
                  />
                  <p className="inline-flex items-center gap-1.5 text-xs text-(--dash-ash)">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    Address signed by @{invoice.username}. Keep the memo so the
                    invoice is marked paid.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </DashboardBackground>
  );
}
