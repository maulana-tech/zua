import { describe, expect, it } from "vitest";
import { findInvoicePayments } from "../src/features/invoices/settle";
import type { InvoiceView } from "../src/features/invoices/types";
import {
  MEMO_CACHE_LIMIT,
  type MemoCache,
  memoCacheEntries,
  receivedMemos,
  txidsNeedingMemos,
  withMemos,
} from "../src/features/zcash/memos";
import type { Disclosure, WalletTx } from "../src/lib/zcash/wallet";

const tx = (txid: string, over: Partial<WalletTx> = {}): WalletTx => ({
  txid,
  kind: "received",
  value: 4_500_000n,
  fee: null,
  height: 10,
  confirmations: 1,
  pending: false,
  memos: [],
  timestamp: null,
  pool: "ironwood",
  ...over,
});

const out = (over: Partial<Disclosure>): Disclosure => ({
  direction: "received",
  pool: "ironwood",
  action: 0,
  kEnc: "00",
  value: 1n,
  memo: "",
  ...over,
});

describe("txidsNeedingMemos", () => {
  it("picks mined incoming payments without memos, newest first", () => {
    const history = [
      tx("old", { height: 5 }),
      tx("new", { height: 9 }),
      tx("unmined", { height: null, pending: true }),
      tx("sent", { kind: "sent", value: -1n }),
      tx("has-memo", { memos: ["hi"] }),
      tx("cached"),
    ];
    const cache: MemoCache = new Map([["cached", []]]);
    expect(txidsNeedingMemos(history, cache)).toEqual(["new", "old"]);
    expect(txidsNeedingMemos(history, cache, 1)).toEqual(["new"]);
  });
});

describe("receivedMemos", () => {
  it("keeps memos paying this account, not change or sent outputs", () => {
    expect(
      receivedMemos([
        out({ memo: "zua:inv:abc" }),
        out({ memo: "change", internal: true }),
        out({ memo: "to someone", direction: "sent" }),
        out({ memo: "" }),
      ]),
    ).toEqual(["zua:inv:abc"]);
  });
});

describe("withMemos", () => {
  it("fills cached memos in, leaving wallet memos alone", () => {
    const cache: MemoCache = new Map([
      ["a", ["zua:pos:s1"]],
      ["b", ["ignored"]],
    ]);
    const [a, b, c] = withMemos(
      [tx("a"), tx("b", { memos: ["wallet"] }), tx("c")],
      cache,
    );
    expect(a.memos).toEqual(["zua:pos:s1"]);
    expect(b.memos).toEqual(["wallet"]);
    expect(c.memos).toEqual([]);
  });

  it("lets a tagged invoice payment settle", () => {
    const invoice = {
      id: "H2zFCKyquI4Y",
      status: "pending",
      paidZat: "0",
    } as InvoiceView;
    const history = withMemos(
      [tx("t1")],
      new Map([["t1", ["zua:inv:H2zFCKyquI4Y"]]]),
    );
    expect(findInvoicePayments(history, [invoice])).toEqual([
      { id: "H2zFCKyquI4Y", txids: ["t1"], paidZat: 4_500_000n },
    ]);
  });
});

describe("memoCacheEntries", () => {
  it("keeps the most recent entries", () => {
    const cache: MemoCache = new Map();
    for (let i = 0; i < MEMO_CACHE_LIMIT + 5; i++) cache.set(`t${i}`, []);
    const entries = memoCacheEntries(cache);
    expect(entries).toHaveLength(MEMO_CACHE_LIMIT);
    expect(entries[0][0]).toBe("t5");
  });
});
