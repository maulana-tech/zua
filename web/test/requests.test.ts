import { describe, expect, it } from "vitest";
import { findRequestPayments } from "../src/features/invoices/settle";
import { messagingPubkeyHex, open, seal } from "../src/lib/sealedBox";
import type { WalletTx } from "../src/lib/zcash/wallet";

const alice = new Uint8Array(32).fill(1);
const bob = new Uint8Array(32).fill(2);

describe("sealed boxes", () => {
  it("opens only with the recipient's secret", () => {
    const box = seal(
      { amountZat: "25000000", note: "dinner" },
      messagingPubkeyHex(alice),
    );
    expect(open(box, alice)).toEqual({ amountZat: "25000000", note: "dinner" });
    expect(() => open(box, bob)).toThrow();
  });
  it("detects tampering", () => {
    const box = seal({ n: 1 }, messagingPubkeyHex(alice));
    const flipped = {
      ...box,
      ct: (box.ct[0] === "0" ? "1" : "0") + box.ct.slice(1),
    };
    expect(() => open(flipped, alice)).toThrow();
  });
});

const tx = (
  txid: string,
  memos: string[],
  kind: WalletTx["kind"] = "received",
): WalletTx => ({
  txid,
  kind,
  value: kind === "received" ? 5n : -5n,
  fee: null,
  height: 1,
  confirmations: 3,
  pending: false,
  memos,
  timestamp: null,
  pool: "orchard",
});

describe("findRequestPayments", () => {
  it("matches received payments tagged for pending requests only", () => {
    const result = findRequestPayments(
      [
        tx("a", ["zua:req:REQ0000001"]),
        tx("b", ["zua:req:OTHER00001"]),
        tx("c", ["zua:req:REQ0000001"], "sent"),
      ],
      new Set(["REQ0000001"]),
    );
    expect(result).toEqual([{ id: "REQ0000001", txids: ["a"] }]);
  });
});
