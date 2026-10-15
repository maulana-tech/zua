import "server-only";
import { randomBytes } from "node:crypto";
import type { InvoiceView } from "../../../features/invoices/types";
import { getInvoices } from "../../db/mongo";
import { createInvoice, publicInvoice } from "../invoices/invoices.service";
import type { CheckoutInput, CheckoutView } from "./developer.schema";
import { takePoolAddress } from "./developer.service";

// A checkout is an invoice created by the merchant's server. It is paid and
// settled exactly like one: the payer's memo tags it, the merchant's wallet
// reports it paid when it syncs (the server never sees the payment), and a
// signed webhook then tells the merchant's server.

export function toCheckout(invoice: InvoiceView, origin: string): CheckoutView {
  const paid = BigInt(invoice.paidZat);
  return {
    id: invoice.id,
    object: "checkout",
    status:
      invoice.status === "pending"
        ? paid > 0n
          ? "partially_paid"
          : "open"
        : invoice.status,
    currency: invoice.currency,
    amount:
      invoice.currency === "USD"
        ? (invoice.totalUsd ?? "").replace(/[$,]/g, "")
        : invoice.totalZec,
    amount_zat:
      invoice.currency === "USD" && !invoice.quote ? null : invoice.totalZat,
    paid_zat: invoice.paidZat,
    reference: invoice.reference,
    description: invoice.notes,
    url: `${origin}/i/${invoice.token}`,
    embed_url: `${origin}/embed/i/${invoice.token}`,
    created_at: invoice.createdAt,
    paid_reported_at: invoice.paidReportedAt,
  };
}

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export async function createCheckout(
  owner: string,
  input: CheckoutInput,
): Promise<InvoiceView> {
  const id = randomBytes(5).toString("hex").toUpperCase();
  // A fresh signed address from the owner's pool; the profile address when
  // the pool is empty (still shielded, just shared with other payments).
  const payAddress = await takePoolAddress(owner, `checkout:${id}`);
  return createInvoice(owner, {
    number: `CO-${id}`,
    clientName: input.customer_name || "Checkout",
    clientEmail: input.customer_email ?? null,
    dueDate: input.due_date ?? inDays(7),
    notes: input.description,
    items: [
      {
        description: input.description || "Checkout",
        quantity: 1,
        unitPrice: input.amount,
      },
    ],
    currency: input.currency,
    recurrence: "none",
    payAddress: payAddress ?? undefined,
    source: "api",
    reference: input.reference ?? null,
  });
}

/** A checkout (any invoice) of `owner`, by id. */
export async function getCheckout(
  owner: string,
  id: string,
): Promise<InvoiceView | null> {
  const doc = await (await getInvoices()).findOne({ _id: id, owner });
  return doc ? publicInvoice(doc.token) : null;
}
