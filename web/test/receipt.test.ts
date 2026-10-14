import { describe, expect, it } from "vitest";
import {
  parseReceipt,
  type ReceiptBody,
  receiptSignatureValid,
  signReceipt,
} from "../src/features/receipts/receipt";
import { signingPubkeyHex } from "../src/lib/profileClaim";
import { profileSigningSeed } from "../src/lib/zcash/seed";

const seed = profileSigningSeed(new Uint8Array(32).fill(9));
const body: ReceiptBody = {
  v: 1,
  network: "main",
  txid: "2ec22f3bd413a2f8a2d9a2f4aa9ccdbc8bbde77186ce47a3549beee114917a88",
  height: 3517165,
  amountZat: "80000000",
  memo: "zua:inv:AAAAAAAA12",
  recipient: { username: "dinar", ua: "u1example" },
  issuedAt: "2026-10-14T00:00:00.000Z",
};

describe("receipts", () => {
  it("round-trips through JSON and verifies against the issuer key", () => {
    const receipt = parseReceipt(JSON.stringify(signReceipt(body, seed)));
    expect(receiptSignatureValid(receipt, signingPubkeyHex(seed))).toBe(true);
  });
  it("fails when the amount is edited or another key is used", () => {
    const receipt = signReceipt(body, seed);
    expect(
      receiptSignatureValid(
        { ...receipt, amountZat: "90000000" },
        signingPubkeyHex(seed),
      ),
    ).toBe(false);
    const other = profileSigningSeed(new Uint8Array(32).fill(8));
    expect(receiptSignatureValid(receipt, signingPubkeyHex(other))).toBe(false);
  });
  it("rejects malformed files", () => {
    expect(() => parseReceipt("nope")).toThrow();
    expect(() =>
      parseReceipt(JSON.stringify({ ...body, sigHex: "x" })),
    ).toThrow();
  });
});
