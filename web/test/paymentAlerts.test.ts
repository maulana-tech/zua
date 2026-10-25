import { describeTx } from "../src/features/zcash/describeTx";
import { newIncoming } from "../src/features/zcash/paymentAlerts";
import { formatMemoTag, parseMemoTag } from "../src/lib/zcash/memo";
import type { WalletTx } from "../src/lib/zcash/wallet";

const tx = (over: Partial<WalletTx>): WalletTx => ({
  txid: "t",
  kind: "received",
  value: 100n,
  fee: null,
  height: 10,
  confirmations: 1,
  pending: false,
  memos: [],
  timestamp: 0,
  pool: "orchard",
  ...over,
});

describe("payment alerts", () => {
  it("announces only incoming payments it hasn't seen", () => {
    const history = [
      tx({ txid: "a" }),
      tx({ txid: "b" }),
      tx({ txid: "c", kind: "sent", value: -50n }),
      tx({ txid: "d", kind: "internal", value: 0n }),
    ];
    expect(newIncoming(history, new Set(["a"])).map((t) => t.txid)).toEqual([
      "b",
    ]);
    expect(newIncoming(history, new Set(["a", "b"]))).toEqual([]);
  });
});

describe("describeTx", () => {
  it("labels point-of-sale payments as sales", () => {
    const memo = formatMemoTag({ kind: "pos", id: "SALE00000001" });
    expect(parseMemoTag(memo)).toEqual({ kind: "pos", id: "SALE00000001" });
    expect(describeTx(tx({ memos: [memo] }))).toBe("Sale");
  });

  it("prefers the payer's note over a bare direction", () => {
    expect(describeTx(tx({ memos: ["for the coffee"] }))).toBe(
      "for the coffee",
    );
    expect(describeTx(tx({ kind: "sent", value: -1n }))).toBe("Sent");
  });
});
