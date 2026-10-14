import { parseMemoTag } from "../../lib/zcash/memo";
import type { WalletTx } from "../../lib/zcash/wallet";
import type { InvoiceView } from "./types";

export type InvoicePayment = { id: string; txids: string[]; paidZat: bigint };

/**
 * Sums received payments whose memo tags an open invoice. Returns only
 * invoices whose paid amount changed, so the owner reports each change once.
 * Partial payments accumulate; "paid" is decided by the server from the total.
 */
export function findInvoicePayments(
  history: WalletTx[],
  invoices: InvoiceView[],
): InvoicePayment[] {
  const open = new Map(
    invoices.filter((i) => i.status === "pending").map((i) => [i.id, i]),
  );
  const found = new Map<string, InvoicePayment>();
  for (const tx of history) {
    if (tx.kind !== "received" || tx.value <= 0n) continue;
    for (const memo of tx.memos) {
      const tag = parseMemoTag(memo);
      if (tag?.kind !== "inv" || !open.has(tag.id)) continue;
      const entry = found.get(tag.id) ?? { id: tag.id, txids: [], paidZat: 0n };
      if (!entry.txids.includes(tx.txid)) {
        entry.txids.push(tx.txid);
        entry.paidZat += tx.value;
      }
      found.set(tag.id, entry);
    }
  }
  return [...found.values()].filter(
    (p) => p.paidZat !== BigInt(open.get(p.id)?.paidZat ?? "0"),
  );
}
