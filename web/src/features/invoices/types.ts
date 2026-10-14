export type InvoiceState = "pending" | "paid" | "void";

export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: string; // ZEC decimal
};

/** What the owner and the public invoice page see. */
export type InvoiceView = {
  id: string; // memo id: the payer's memo is `zapp:inv:<id>`
  token: string;
  username: string;
  ua: string;
  number: string;
  clientName: string;
  items: InvoiceLine[];
  totalZat: string;
  totalZec: string;
  paidZat: string;
  notes: string;
  dueDate: string;
  status: InvoiceState;
  paidTxids: string[];
  paidReportedAt: string | null;
  createdAt: string;
};
