import {
  formatMemoTag,
  parseMemoTag,
  sanitizeMemo,
} from "../../lib/zcash/memo";
import type { WalletTx } from "../../lib/zcash/wallet";

const TAG_LABELS = {
  inv: "Invoice payment",
  link: "Payment link",
  req: "Request payment",
  tip: "Tip",
  pos: "Sale",
} as const;

/**
 * One-line label for a payment: what its app tag pays (with any note after
 * the tag, like a sale's "2 iced coffees"), else the payer's note.
 */
export function describeTx(tx: WalletTx): string {
  for (const memo of tx.memos) {
    const tag = parseMemoTag(memo);
    if (!tag) continue;
    const rest = sanitizeMemo(memo.trim().slice(formatMemoTag(tag).length));
    return rest ? `${TAG_LABELS[tag.kind]} · ${rest}` : TAG_LABELS[tag.kind];
  }
  const note = tx.memos.map(sanitizeMemo).find((m) => m && !parseMemoTag(m));
  if (note) return note;
  return tx.kind === "received"
    ? "Received"
    : tx.kind === "sent"
      ? "Sent"
      : "Internal transfer";
}
