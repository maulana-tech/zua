import type { Disclosure } from "../../lib/zcash/wallet";
import type { ReceiptItem } from "./receipt";

/**
 * Receipt items for one transaction: the outputs going `direction`, grouped
 * by receiving address (a payroll transaction pays several). Change
 * (internal) outputs are never included.
 */
export function itemsFromDisclosures(
  txid: string,
  height: number,
  disclosures: Disclosure[],
  direction: "received" | "sent",
): ReceiptItem[] {
  const byAddress = new Map<string, Disclosure[]>();
  for (const d of disclosures) {
    if (d.direction !== direction || d.internal || !d.recipient) continue;
    byAddress.set(d.recipient, [...(byAddress.get(d.recipient) ?? []), d]);
  }
  return [...byAddress].map(([recipientUa, outs]) => ({
    txid,
    height,
    amountZat: outs.reduce((t, d) => t + d.value, 0n).toString(),
    memo: outs
      .map((d) => d.memo)
      .filter(Boolean)
      .join("\n"),
    recipientUa,
    disclosures: outs.map(({ pool, action, kEnc }) => ({ pool, action, kEnc })),
  }));
}

/** YYYY-MM-DD of a ms timestamp in UTC, for statement periods. */
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
