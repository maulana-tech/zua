import { describe, expect, it } from "vitest";
import { itemsFromDisclosures } from "../src/features/receipts/build";
import {
  parseReceipt,
  type ReceiptBody,
  receiptCsv,
  receiptSignatureValid,
  signReceipt,
  sumZat,
} from "../src/features/receipts/receipt";
import { signingPubkeyHex } from "../src/lib/profileClaim";
import { profileSigningSeed } from "../src/lib/zcash/seed";

const seed = profileSigningSeed(new Uint8Array(32).fill(9));
const item = {
  txid: "2ec22f3bd413a2f8a2d9a2f4aa9ccdbc8bbde77186ce47a3549beee114917a88",
  height: 3517165,
  amountZat: "80000000",
  memo: "zua:inv:AAAAAAAA12",
  recipientUa: "u1recipientaddressxxxx",
  disclosures: [
    { pool: "ironwood" as const, action: 1, kEnc: "ab".repeat(32) },
  ],
};
const body: ReceiptBody = {
  v: 3,
  kind: "received",
  network: "main",
  signer: "dinar",
  period: null,
  items: [item],
  totalZat: "80000000",
  issuedAt: "2026-10-15T00:00:00.000Z",
};

describe("receipts", () => {
  it("round-trips through JSON and verifies against the issuer key", () => {
    const receipt = parseReceipt(JSON.stringify(signReceipt(body, seed)));
    expect(receiptSignatureValid(receipt, signingPubkeyHex(seed))).toBe(true);
  });

  it("fails when an amount, a key or the kind is edited", () => {
    const receipt = signReceipt(body, seed);
    const pub = signingPubkeyHex(seed);
    expect(
      receiptSignatureValid(
        {
          ...receipt,
          items: [{ ...item, amountZat: "90000000" }],
          totalZat: "90000000",
        },
        pub,
      ),
    ).toBe(false);
    expect(
      receiptSignatureValid(
        {
          ...receipt,
          items: [
            {
              ...item,
              disclosures: [{ ...item.disclosures[0], kEnc: "cd".repeat(32) }],
            },
          ],
        },
        pub,
      ),
    ).toBe(false);
    expect(receiptSignatureValid({ ...receipt, kind: "sent" }, pub)).toBe(
      false,
    );
    const other = profileSigningSeed(new Uint8Array(32).fill(8));
    expect(receiptSignatureValid(receipt, signingPubkeyHex(other))).toBe(false);
  });

  it("rejects malformed files", () => {
    const signed = signReceipt(body, seed);
    const bad = (patch: object) => () =>
      parseReceipt(JSON.stringify({ ...signed, ...patch }));
    expect(() => parseReceipt("nope")).toThrow();
    expect(bad({ sigHex: "x" })).toThrow();
    expect(bad({ items: [] })).toThrow();
    expect(bad({ totalZat: "1" })).toThrow(); // total must equal the items
    expect(bad({ period: { from: "2026-10-01", to: "2026-10-31" } })).toThrow();
    expect(bad({ kind: "statement" })).toThrow(); // statements need a period
    expect(
      bad({
        items: [
          {
            ...item,
            disclosures: [
              { pool: "sapling", action: 0, kEnc: "ab".repeat(32) },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("builds items per receiving address and skips change", () => {
    const d = (
      direction: "received" | "sent",
      recipient: string,
      value: bigint,
      memo = "",
      internal = false,
    ) => ({
      direction,
      pool: "ironwood" as const,
      action: Math.floor(Math.random() * 1e6),
      kEnc: "ab".repeat(32),
      value,
      memo,
      internal,
      recipient,
    });
    const items = itemsFromDisclosures(
      item.txid,
      10,
      [
        d("sent", "u1alice", 5n, "salary"),
        d("sent", "u1bob", 7n, "salary"),
        d("received", "u1me", 99n, "", true), // change
      ],
      "sent",
    );
    expect(items.map((i) => [i.recipientUa, i.amountZat, i.memo])).toEqual([
      ["u1alice", "5", "salary"],
      ["u1bob", "7", "salary"],
    ]);
    expect(itemsFromDisclosures(item.txid, 10, [], "received")).toEqual([]);
    expect(sumZat(items)).toBe("12");
  });

  it("exports a CSV with a total row", () => {
    expect(receiptCsv(body)).toBe(
      [
        "txid,block,amount_zec,memo",
        `${item.txid},3517165,0.80000000,"zua:inv:AAAAAAAA12"`,
        "total,,0.80000000,",
      ].join("\n"),
    );
  });
});
