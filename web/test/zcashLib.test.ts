import { describe, expect, it } from "vitest";
import { addressKind } from "../src/lib/zcash/address";
import {
  formatMemoTag,
  newMemoId,
  parseMemoTag,
  sanitizeMemo,
} from "../src/lib/zcash/memo";
import { mnemonicFromMaster, walletDbKey } from "../src/lib/zcash/seed";
import { zatToZec, zecToZat } from "../src/lib/zcash/units";
import { buildPaymentUri, parsePaymentUri } from "../src/lib/zcash/zip321";

// ZIP-321 spec example (testnet Sapling address).
const SPEC_ADDR =
  "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez";
const SPEC_URI = `zcash:${SPEC_ADDR}?amount=1&memo=VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg&message=Thank%20you%20for%20your%20purchase`;

describe("units", () => {
  it("round-trips ZEC and zatoshi", () => {
    expect(zecToZat("0.8")).toBe(80_000_000n);
    expect(zecToZat("12.00000001")).toBe(1_200_000_001n);
    expect(zatToZec(80_000_000n)).toBe("0.8");
    expect(zatToZec(1n)).toBe("0.00000001");
    expect(zatToZec(100_000_000n)).toBe("1");
  });
  it("rejects more than 8 decimals or junk", () => {
    expect(() => zecToZat("0.000000001")).toThrow();
    expect(() => zecToZat("1e3")).toThrow();
    expect(() => zecToZat("-1")).toThrow();
  });
});

describe("zip321", () => {
  it("parses the spec example", () => {
    const req = parsePaymentUri(SPEC_URI);
    expect(req).toEqual({
      address: SPEC_ADDR,
      amountZat: 100_000_000n,
      memo: "This is a simple memo.",
      message: "Thank you for your purchase",
    });
  });
  it("builds the spec example", () => {
    expect(
      buildPaymentUri({
        address: SPEC_ADDR,
        amountZat: 100_000_000n,
        memo: "This is a simple memo.",
        message: "Thank you for your purchase",
      }),
    ).toBe(SPEC_URI);
  });
  it("round-trips UTF-8 memos and omits the amount when open", () => {
    const uri = buildPaymentUri({
      address: SPEC_ADDR,
      memo: "zapp:inv:7Kq2mZp9Xa ☕",
      label: "@dinar",
    });
    expect(uri).not.toContain("amount=");
    expect(parsePaymentUri(uri).memo).toBe("zapp:inv:7Kq2mZp9Xa ☕");
    expect(parsePaymentUri(uri).label).toBe("@dinar");
  });
  it("refuses multi-payment and unknown required params", () => {
    expect(() =>
      parsePaymentUri(`zcash:?address.1=${SPEC_ADDR}&amount.1=1`),
    ).toThrow();
    expect(() => parsePaymentUri(`zcash:${SPEC_ADDR}?req-future=1`)).toThrow();
  });
});

describe("memo tags", () => {
  it("formats and parses app tags, tolerating trailing text", () => {
    const tag = formatMemoTag({ kind: "inv", id: "7Kq2mZp9Xa" });
    expect(tag).toBe("zapp:inv:7Kq2mZp9Xa");
    expect(parseMemoTag(`${tag} thanks!`)).toEqual({
      kind: "inv",
      id: "7Kq2mZp9Xa",
    });
    expect(parseMemoTag("thanks for the logo")).toBeNull();
    expect(parseMemoTag("zapp:xyz:7Kq2mZp9Xa")).toBeNull();
  });
  it("makes random base62 ids", () => {
    expect(newMemoId()).toMatch(/^[0-9A-Za-z]{12}$/);
  });
  it("strips control characters", () => {
    expect(sanitizeMemo("hi\u0007\u0000 there\n")).toBe("hi there");
  });
});

describe("addresses", () => {
  it("classifies by network prefix", () => {
    expect(addressKind(SPEC_ADDR, "test")).toBe("sapling");
    expect(addressKind(SPEC_ADDR, "main")).toBeNull();
    expect(addressKind("t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs", "main")).toBe(
      "transparent",
    );
  });
});

describe("seed derivation", () => {
  it("is deterministic per master and domain-separated", () => {
    const master = new Uint8Array(32).fill(7);
    const a = mnemonicFromMaster(master);
    expect(a.split(" ")).toHaveLength(24);
    expect(mnemonicFromMaster(master)).toBe(a);
    expect(mnemonicFromMaster(new Uint8Array(32).fill(8))).not.toBe(a);
    expect(Buffer.from(walletDbKey(master)).toString("hex")).not.toBe(
      Buffer.from(walletDbKey(new Uint8Array(32).fill(8))).toString("hex"),
    );
  });
});
