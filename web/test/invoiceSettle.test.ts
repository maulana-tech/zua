import { describe, expect, it } from "vitest";
import { findInvoicePayments } from "../src/features/invoices/settle";
import type { InvoiceView } from "../src/features/invoices/types";
import type { WalletTx } from "../src/lib/zcash/wallet";

const invoice = (id: string, over: Partial<InvoiceView> = {}): InvoiceView => ({
  id,
  token: "t".repeat(32),
  username: "dinar",
  ua: "u1x",
  number: "INV-1",
  clientName: "Client",
  items: [],
  totalZat: "100000000",
  totalZec: "1",
  paidZat: "0",
  notes: "",
  dueDate: "2026-12-31",
  status: "pending",
  paidTxids: [],
  paidReportedAt: null,
  createdAt: "2026-10-14T00:00:00Z",
  ...over,
});

const tx = (
  txid: string,
  value: bigint,
  memos: string[],
  kind: WalletTx["kind"] = "received",
): WalletTx => ({
  txid,
  kind,
  value,
  fee: null,
  height: 1,
  confirmations: 3,
  pending: false,
  memos,
  timestamp: null,
  pool: "orchard",
});

describe("findInvoicePayments", () => {
  it("sums partial payments tagged for an open invoice", () => {
    const result = findInvoicePayments(
      [
        tx("a", 40_000_000n, ["zapp:inv:AAAAAAAA12"]),
        tx("b", 60_000_000n, ["zapp:inv:AAAAAAAA12 thanks"]),
      ],
      [invoice("AAAAAAAA12")],
    );
    expect(result).toEqual([
      { id: "AAAAAAAA12", txids: ["a", "b"], paidZat: 100_000_000n },
    ]);
  });

  it("ignores sends, other tags, void invoices and unchanged totals", () => {
    const result = findInvoicePayments(
      [
        tx("a", -5n, ["zapp:inv:AAAAAAAA12"], "sent"),
        tx("b", 5n, ["zapp:link:AAAAAAAA12"]),
        tx("c", 5n, ["zapp:inv:BBBBBBBB12"]),
        tx("d", 7n, ["zapp:inv:CCCCCCCC12"]),
      ],
      [
        invoice("AAAAAAAA12"),
        invoice("BBBBBBBB12", { status: "void" }),
        invoice("CCCCCCCC12", { paidZat: "7" }),
      ],
    );
    expect(result).toEqual([]);
  });
});
