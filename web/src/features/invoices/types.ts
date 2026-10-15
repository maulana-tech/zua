export type InvoiceState = "pending" | "paid" | "void";

export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: string; // decimal in the invoice currency
};

/** What the owner and the public invoice page see. */
export type InvoiceView = {
  id: string; // memo id: the payer's memo is `zua:inv:<id>`
  token: string;
  username: string;
  ua: string;
  /** Per-invoice address signed by the owner; null on older invoices. */
  payAddress: { claimJson: string; sigHex: string } | null;
  number: string;
  clientName: string;
  items: InvoiceLine[];
  currency: "ZEC" | "USD";
  /** USD invoices: the dollar total, e.g. "$1,250.00". */
  totalUsd: string | null;
  /** USD invoices: the ZEC amount locked for payers, or null before one. */
  quote: { zat: string; usdPerZec: number; expiresAt: string } | null;
  /** ZEC due: the invoice total, or the current quote for USD invoices. */
  totalZat: string;
  totalZec: string;
  paidZat: string;
  notes: string;
  dueDate: string;
  status: InvoiceState;
  recurrence: "none" | "weekly" | "monthly";
  /** ISO time the next invoice of the series is issued, if it repeats. */
  nextIssueAt: string | null;
  paidTxids: string[];
  paidReportedAt: string | null;
  createdAt: string;
};
