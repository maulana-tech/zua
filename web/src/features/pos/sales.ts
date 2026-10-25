import { toCsv } from "../../lib/csv";
import type { FiatCode } from "../../lib/fiat";
import { formatMemoTag, parseMemoTag } from "../../lib/zcash/memo";
import { zatToZec } from "../../lib/zcash/units";
import type { WalletTx } from "../../lib/zcash/wallet";

// Point-of-sale charges live only in this device's encrypted vault: the server
// never hears about a sale. A sale's status comes from the wallet history, so
// a customer who pays after the cashier cancelled still shows up as paid.
export type Sale = {
  id: string;
  /** Zatoshi as a decimal string (the vault stores JSON). */
  amountZat: string;
  /** What the cashier typed when charging in a fiat currency. */
  fiat: { code: FiatCode; amount: number } | null;
  note: string;
  createdAt: number;
  cancelled: boolean;
};

export type SaleStatus = "waiting" | "partial" | "paid" | "cancelled";

export type SalePayment = {
  paidZat: bigint;
  txids: string[];
  paidAt: number | null;
};

export const SALES_RECORD = "pos-sales";
export const MAX_SALES = 500;
export const MAX_NOTE_LENGTH = 80;

/** Memo for a sale: the tag, then the note so the customer's wallet shows it. */
export function saleMemo(sale: Pick<Sale, "id" | "note">): string {
  const tag = formatMemoTag({ kind: "pos", id: sale.id });
  const note = sale.note.trim();
  return note ? `${tag} ${note}` : tag;
}

/** Received payments tagged `zua:pos:<id>`, summed per sale. */
export function salePayments(history: WalletTx[]): Map<string, SalePayment> {
  const found = new Map<string, SalePayment>();
  for (const tx of history) {
    if (tx.kind !== "received" || tx.value <= 0n) continue;
    for (const memo of tx.memos) {
      const tag = parseMemoTag(memo);
      if (tag?.kind !== "pos") continue;
      const entry = found.get(tag.id) ?? {
        paidZat: 0n,
        txids: [],
        paidAt: null,
      };
      if (entry.txids.includes(tx.txid)) continue;
      entry.txids.push(tx.txid);
      entry.paidZat += tx.value;
      if (
        tx.timestamp &&
        (entry.paidAt === null || tx.timestamp > entry.paidAt)
      )
        entry.paidAt = tx.timestamp;
      found.set(tag.id, entry);
    }
  }
  return found;
}

export function saleStatus(
  sale: Sale,
  payment: SalePayment | undefined,
): SaleStatus {
  const paid = payment?.paidZat ?? 0n;
  if (paid >= BigInt(sale.amountZat)) return "paid";
  if (paid > 0n) return "partial";
  return sale.cancelled ? "cancelled" : "waiting";
}

/** Newest first, capped, so the vault record stays small. */
export function addSale(sales: Sale[], sale: Sale): Sale[] {
  return [sale, ...sales.filter((s) => s.id !== sale.id)].slice(0, MAX_SALES);
}

export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** Zatoshi received for sales started on `day` (local time), and their count. */
export function dayTotal(
  sales: Sale[],
  payments: Map<string, SalePayment>,
  day: number,
): { zat: bigint; count: number } {
  let zat = 0n;
  let count = 0;
  for (const sale of sales) {
    if (!isSameDay(sale.createdAt, day)) continue;
    const paid = payments.get(sale.id)?.paidZat ?? 0n;
    if (paid <= 0n) continue;
    zat += paid;
    count += 1;
  }
  return { zat, count };
}

/** Spreadsheet export of the sales log; amounts in ZEC. */
export function salesCsv(
  sales: Sale[],
  payments: Map<string, SalePayment>,
): string {
  const rows = [
    [
      "date",
      "sale",
      "amount_zec",
      "paid_zec",
      "status",
      "fiat",
      "fiat_amount",
      "note",
    ],
  ];
  for (const sale of sales) {
    const payment = payments.get(sale.id);
    rows.push([
      new Date(sale.createdAt).toISOString(),
      sale.id,
      zatToZec(BigInt(sale.amountZat)),
      zatToZec(payment?.paidZat ?? 0n),
      saleStatus(sale, payment),
      sale.fiat?.code ?? "",
      sale.fiat ? String(sale.fiat.amount) : "",
      sale.note,
    ]);
  }
  return toCsv(rows);
}
