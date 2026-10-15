"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Plus, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { invoiceStatus } from "../../features/invoices/input";
import { recurrenceLabel } from "../../features/invoices/recurrence";
import type { InvoiceView } from "../../features/invoices/types";
import { SIGN_IN_PATH } from "../../lib/auth-routes";
import { downloadInvoicePdf } from "../../lib/invoicePdf";
import { zatToZec } from "../../lib/zcash/units";
import { api } from "../../trpc/client";
import { DashboardPageHeader } from "../dashboard/DashboardPageHeader";
import { PaymentQrDialog } from "../dashboard/PaymentQrDialog";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashFocus,
  dashIconButton,
} from "../dashboard/styles";
import { Mascot } from "../Mascot";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useWallet } from "../WalletProvider";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";

export function InvoicesDashboard() {
  const { authenticated, username, sessionReady } = useWallet();
  const [createOpen, setCreateOpen] = useState(false),
    [origin, setOrigin] = useState("");
  const query = useQuery({
    queryKey: ["owner-invoices", username],
    enabled: Boolean(username) && sessionReady,
    queryFn: () => api.invoices.list.query(),
    refetchInterval: 15_000,
    retry: false,
  });
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (sessionReady && !authenticated) window.location.replace(SIGN_IN_PATH);
  }, [sessionReady, authenticated]);
  if (!sessionReady || !authenticated)
    return <p role="status">Loading your invoices…</p>;
  return (
    <>
      <DashboardPageHeader
        title="Invoices"
        description="Bill in ZEC, share the link, and see it marked paid as soon as your wallet finds the payment."
        action={
          <button
            type="button"
            className={`${dashButtonPrimary} min-h-11`}
            onClick={() => setCreateOpen(true)}
            disabled={!username}
          >
            <Plus aria-hidden="true" />
            New invoice
          </button>
        }
      />
      {!username && (
        <p className="mb-5 text-sm text-(--dash-ash)">
          Claim your username before creating an invoice.
        </p>
      )}
      {query.isError && (
        <section role="alert" className="mb-5 text-sm">
          <p>Invoices could not be loaded.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={`${dashButtonSecondary} mt-3`}
          >
            Try again
          </button>
        </section>
      )}
      {query.isLoading ? (
        <p role="status">Loading invoices…</p>
      ) : query.data?.length === 0 ? (
        <section
          className={`${dashCell} border border-(--dash-line-solid) p-8`}
        >
          <Mascot mood="idle" />
          <h2 className="mt-5 text-xl">Your first invoice starts here</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-(--dash-ash)">
            Set a total in ZEC and share the link. Your client pays with any
            Zcash wallet; the payment carries a private tag, so your wallet
            marks the invoice paid by itself.
          </p>
        </section>
      ) : (
        <section
          aria-label="Your invoices"
          className="divide-y divide-(--dash-line-solid) border border-(--dash-line-solid)"
        >
          {query.data?.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              origin={origin}
              onChanged={() => void query.refetch()}
            />
          ))}
        </section>
      )}
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          void query.refetch();
        }}
      />
    </>
  );
}
export function InvoiceRow({
  invoice,
  origin,
  onChanged,
}: {
  invoice: InvoiceView;
  origin: string;
  onChanged: () => void;
}) {
  const [qrOpen, setQrOpen] = useState(false),
    [voidOpen, setVoidOpen] = useState(false),
    [working, setWorking] = useState(false),
    [downloading, setDownloading] = useState(false),
    [message, setMessage] = useState("");
  const trigger = useRef<HTMLButtonElement>(null),
    alive = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const url = `${origin}/i/${invoice.token}`,
    status = invoiceStatus(invoice.status, invoice.dueDate);
  const labels = {
    pending: "Pending",
    paid: "Paid",
    void: "Void",
    overdue: "Overdue",
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      if (alive.current) setMessage("Invoice link copied.");
    } catch {
      if (alive.current)
        setMessage("Copy failed. Open the invoice and copy its address.");
    }
  }
  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice, { origin });
    } catch (e) {
      if (alive.current) {
        setMessage(e instanceof Error ? e.message : "Failed to generate PDF.");
      }
    } finally {
      if (alive.current) setDownloading(false);
    }
  }
  async function stopRepeating() {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setMessage("");
    try {
      await api.invoices.stopRecurring.mutate({ id: invoice.id });
      if (alive.current) {
        setMessage("This invoice won't repeat anymore.");
        onChanged();
      }
    } catch (e) {
      if (alive.current)
        setMessage(e instanceof Error ? e.message : "Couldn't stop it.");
    } finally {
      busy.current = false;
      if (alive.current) setWorking(false);
    }
  }
  async function cancel() {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setMessage("");
    try {
      await api.invoices.void.mutate({ id: invoice.id });
      if (alive.current) {
        setVoidOpen(false);
        onChanged();
      }
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error ? e.message : "Invoice could not be voided.",
        );
    } finally {
      busy.current = false;
      if (alive.current) setWorking(false);
    }
  }
  return (
    <article className={`${dashCell} p-5 sm:p-6`}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <a
            href={`/i/${invoice.token}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-2 break-all text-lg font-medium ${dashFocus}`}
          >
            {invoice.number}
            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
          </a>
          <p className="mt-1 break-words text-sm text-(--dash-ash)">
            {invoice.clientName} · Due {invoice.dueDate} UTC
            {invoice.recurrence !== "none" && invoice.nextIssueAt
              ? ` · ${recurrenceLabel(invoice.recurrence)}, next on ${invoice.nextIssueAt.slice(0, 10)}`
              : ""}
            {invoice.status === "pending" && invoice.paidZat !== "0"
              ? ` · ${zatToZec(BigInt(invoice.paidZat))} ZEC received so far`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-lg whitespace-nowrap tabular-nums">
            {invoice.currency === "USD"
              ? invoice.totalUsd
              : `${invoice.totalZec} ZEC`}
          </p>
          <span className="rounded-full border border-(--dash-line) px-3 py-1 text-xs">
            {labels[status]}
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${dashButtonSecondary} min-h-11`}
          disabled={!origin}
          onClick={() => void copy()}
        >
          <Copy aria-hidden="true" />
          Copy link
        </button>
        <button
          type="button"
          ref={trigger}
          className={`${dashIconButton} size-11`}
          aria-label={`QR for ${invoice.number}`}
          disabled={!origin}
          onClick={() => setQrOpen(true)}
        >
          <QrCode aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${dashButtonSecondary} min-h-11`}
          disabled={downloading}
          onClick={() => void handleDownload()}
        >
          <Download aria-hidden="true" className="size-4" />
          {downloading ? "Downloading…" : "Download PDF"}
        </button>
        {invoice.status === "pending" && (
          <button
            type="button"
            className={`${dashButtonSecondary} min-h-11`}
            onClick={() => setVoidOpen(true)}
          >
            Void invoice
          </button>
        )}
        {invoice.recurrence !== "none" && (
          <button
            type="button"
            className={`${dashButtonSecondary} min-h-11`}
            disabled={working}
            onClick={() => void stopRepeating()}
          >
            Stop repeating
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-(--dash-ash)">
          {message}
        </p>
      )}
      <PaymentQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        url={url}
        asset="ZEC"
        triggerRef={trigger}
      />
      <Dialog
        open={voidOpen}
        onOpenChange={(value) => {
          if (!busy.current) setVoidOpen(value);
        }}
      >
        <DialogContent appearance="linen" size="sm" showCloseButton={!working}>
          <DialogHeader>
            <DialogTitle>Void {invoice.number}?</DialogTitle>
            <DialogDescription>
              The invoice page will stop showing a payment code. Payments that
              already arrived stay in your balance.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => setVoidOpen(false)}
            >
              Keep invoice
            </Button>
            <Button
              type="button"
              disabled={working || invoice.status !== "pending"}
              onClick={() => void cancel()}
            >
              {working ? "Voiding…" : "Confirm void"}
            </Button>
          </div>
          {message && (
            <p role="alert" className="text-sm">
              {message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
