"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  invoiceInput,
  invoiceTotal,
  suggestNextNumber,
} from "../../features/invoices/input";
import { type Currency, centsToUsd } from "../../features/invoices/money";
import type { Recurrence } from "../../features/invoices/recurrence";
import type { InvoiceView } from "../../features/invoices/types";
import { zatToZec } from "../../lib/zcash/units";
import { api } from "../../trpc/client";
import { Segmented, type SegmentOption } from "../dashboard/Segmented";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { OptionSelect, type SelectOption } from "../ui/select";
import { useWallet } from "../WalletProvider";

const emptyLine = () => ({
  id: "initial",
  description: "",
  quantity: "1",
  unitPrice: "",
});
const CURRENCY_OPTIONS: SegmentOption<Currency>[] = [
  { value: "ZEC", label: "ZEC" },
  { value: "USD", label: "USD" },
];
const REPEAT_OPTIONS: SelectOption<Recurrence>[] = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];
const defaultDue = () =>
  new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

/** Start from an existing invoice: a copy with a new number, or an edit. */
export type InvoiceTemplate = {
  invoice: InvoiceView;
  mode: "duplicate" | "edit";
};

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  onSaved,
  template = null,
  takenNumbers = [],
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSaved: (invoice: InvoiceView) => void;
  template?: InvoiceTemplate | null;
  takenNumbers?: string[];
}) {
  const wallet = useWallet();
  const editing = template?.mode === "edit" ? template.invoice : null;
  const [number, setNumber] = useState(""),
    [clientName, setClientName] = useState(""),
    [dueDate, setDueDate] = useState(defaultDue),
    [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [currency, setCurrency] = useState<Currency>("ZEC");
  const [clientEmail, setClientEmail] = useState(""),
    [lines, setLines] = useState([emptyLine()]),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const identity = `${wallet.username}:${open}`,
    session = useRef(identity),
    mounted = useRef(true),
    busy = useRef(false);
  session.current = identity;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Fill the form once per template; a plain "New invoice" starts blank.
  const filledFrom = useRef("");
  const templateKey = template ? `${template.mode}:${template.invoice.id}` : "";
  useEffect(() => {
    if (!open || filledFrom.current === templateKey) return;
    filledFrom.current = templateKey;
    setError("");
    if (!template) {
      setNumber("");
      setClientName("");
      setClientEmail("");
      setDueDate(defaultDue());
      setNotes("");
      setRecurrence("none");
      setCurrency("ZEC");
      setLines([emptyLine()]);
      return;
    }
    const source = template.invoice;
    const edit = template.mode === "edit";
    setNumber(
      edit
        ? source.number
        : suggestNextNumber(source.number, new Set(takenNumbers)),
    );
    setClientName(source.clientName);
    setClientEmail("");
    setDueDate(edit ? source.dueDate : defaultDue());
    setNotes(source.notes);
    setCurrency(source.currency);
    // A copy of a recurring invoice shouldn't start a second series.
    setRecurrence(edit ? source.recurrence : "none");
    setLines(
      source.items.map((item, i) => ({
        id: `copy-${i}`,
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: item.unitPrice,
      })),
    );
  }, [open, templateKey, template, takenNumbers]);
  const inputItems = lines.map(({ description, quantity, unitPrice }) => ({
    description,
    quantity: Number(quantity),
    unitPrice,
  }));
  let total: bigint | null = null;
  try {
    if (
      lines.every(
        (l) =>
          Number.isInteger(Number(l.quantity)) &&
          Number(l.quantity) > 0 &&
          (currency === "USD" ? /^\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,8})?$/).test(
            l.unitPrice,
          ),
      )
    )
      total = invoiceTotal(inputItems, currency);
  } catch {}
  function change(
    id: string,
    key: "description" | "quantity" | "unitPrice",
    value: string,
  ) {
    setLines((items) =>
      items.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    const parsed = invoiceInput.safeParse({
      number,
      clientName,
      clientEmail,
      dueDate,
      notes,
      items: inputItems,
      currency,
      recurrence,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Review the invoice details.",
      );
      return;
    }
    const at = session.current;
    busy.current = true;
    setWorking(true);
    const details = {
      number,
      clientName,
      clientEmail,
      dueDate,
      notes,
      items: inputItems,
      currency,
      recurrence,
    };
    try {
      const invoice = editing
        ? await api.invoices.update.mutate({
            id: editing.id,
            invoice: details,
            keepClientEmail: !clientEmail.trim(),
          })
        : await api.invoices.create.mutate({
            ...details,
            // Each invoice gets its own address so clients can't link payments.
            payAddress: await wallet.freshPayAddress(),
          });
      if (mounted.current && session.current === at) {
        onSaved(invoice);
        onOpenChange(false);
        // The next open starts over, blank or from its template.
        filledFrom.current = "saved";
      }
    } catch (e) {
      if (mounted.current && session.current === at)
        setError(
          e instanceof Error
            ? e.message
            : editing
              ? "Invoice could not be saved."
              : "Invoice could not be created. Check your list before retrying.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy.current) onOpenChange(value);
      }}
    >
      <DialogContent appearance="linen" size="lg" showCloseButton={!working}>
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${editing.number}` : "New invoice"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Fix the details before your client pays. The link stays the same, so anyone who has it sees the update."
              : template
                ? `A copy of ${template.invoice.number} with a new number and its own payment link. Details are visible to the server and anyone with the link.`
                : "Publish an invoice and share its payment link. Details are visible to the server and anyone with the link."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void submit(event)}
          className="grid gap-5"
          aria-label={editing ? "Edit invoice" : "Create invoice"}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm" htmlFor="invoice-number">
              Invoice number
              <Input
                id="invoice-number"
                appearance="linen"
                className="min-h-11"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="INV-2026-001"
                maxLength={40}
                required
              />
            </label>
            <label className="grid gap-2 text-sm" htmlFor="invoice-client">
              Client name
              <Input
                id="invoice-client"
                appearance="linen"
                className="min-h-11"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                maxLength={120}
                required
              />
            </label>
            <div className="grid gap-2 text-sm">
              <span id="invoice-due-label">Due date (UTC)</span>
              <DatePicker
                id="invoice-due"
                aria-labelledby="invoice-due-label"
                className="min-h-11"
                value={dueDate}
                onChange={setDueDate}
              />
            </div>
            <div className="grid gap-2 text-sm">
              <span id="invoice-currency-label">Priced in</span>
              <Segmented<Currency>
                aria-labelledby="invoice-currency-label"
                className="h-11"
                value={currency}
                onChange={setCurrency}
                options={CURRENCY_OPTIONS}
              />
              {currency === "USD" ? (
                <span className="text-xs text-(--dash-ash)">
                  Paid in ZEC at a rate locked for 30 minutes when the client
                  opens the invoice.
                </span>
              ) : null}
            </div>
            <div className="grid gap-2 text-sm">
              <span id="invoice-repeat-label">Repeat</span>
              <OptionSelect<Recurrence>
                id="invoice-repeat"
                aria-labelledby="invoice-repeat-label"
                value={recurrence}
                onValueChange={setRecurrence}
                options={REPEAT_OPTIONS}
                disabled={Boolean(editing)}
                title={
                  editing
                    ? "Use Stop repeating in the list to end a series"
                    : undefined
                }
              />
            </div>
            <label className="grid gap-2 text-sm" htmlFor="invoice-email">
              Client email (optional)
              <Input
                id="invoice-email"
                appearance="linen"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder={
                  editing
                    ? "Leave empty to keep the saved email"
                    : "For the payment receipt"
                }
              />
            </label>
          </div>
          <fieldset className="grid gap-4">
            <legend className="mb-3 text-sm font-medium">Line items</legend>
            {lines.map((item, index) => (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-3 border-b border-border pb-4"
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem]">
                  <label
                    className="grid gap-2 text-sm"
                    htmlFor={`invoice-desc-${item.id}`}
                  >
                    Description {index + 1}
                    <Input
                      id={`invoice-desc-${item.id}`}
                      appearance="linen"
                      className="min-h-11"
                      value={item.description}
                      onChange={(e) =>
                        change(item.id, "description", e.target.value)
                      }
                      maxLength={200}
                      required
                    />
                  </label>
                  <label
                    className="grid gap-2 text-sm"
                    htmlFor={`invoice-qty-${item.id}`}
                  >
                    Quantity {index + 1}
                    <Input
                      id={`invoice-qty-${item.id}`}
                      appearance="linen"
                      className="min-h-11"
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      value={item.quantity}
                      onChange={(e) =>
                        change(item.id, "quantity", e.target.value)
                      }
                      required
                    />
                  </label>
                  <label
                    className="grid gap-2 text-sm"
                    htmlFor={`invoice-price-${item.id}`}
                  >
                    Unit price {index + 1} · {currency}
                    <Input
                      id={`invoice-price-${item.id}`}
                      appearance="linen"
                      className="min-h-11"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={item.unitPrice}
                      onChange={(e) =>
                        change(item.id, "unitPrice", e.target.value)
                      }
                      required
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-6 min-h-11"
                  size="icon"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lines.length === 1 || working}
                  onClick={() =>
                    setLines((items) =>
                      items.filter((line) => line.id !== item.id),
                    )
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ))}
          </fieldset>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 justify-self-start"
            disabled={lines.length >= 25 || working}
            onClick={() =>
              setLines((items) => [
                ...items,
                { ...emptyLine(), id: crypto.randomUUID() },
              ])
            }
          >
            <Plus aria-hidden="true" />
            Add line
          </Button>
          <label className="grid gap-2 text-sm" htmlFor="invoice-notes">
            Notes (optional)
            <textarea
              id="invoice-notes"
              className="min-h-20 w-full rounded-lg border border-input bg-card p-3 text-base"
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-4">
            <span>Total</span>
            <strong className="text-xl font-medium tabular-nums">
              {total === null
                ? "—"
                : currency === "USD"
                  ? centsToUsd(total)
                  : `${zatToZec(total)} ZEC`}
            </strong>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            You can edit the invoice until it receives a payment. After that
            it&apos;s fixed: void it and create a new one.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="min-h-11"
            disabled={working || !wallet.username}
          >
            {editing
              ? working
                ? "Saving…"
                : "Save changes"
              : working
                ? "Creating invoice…"
                : "Create invoice"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
