import { describe, expect, it } from "vitest";
import {
  centsToUsd,
  priceMicro,
  quoteZat,
  usdToCents,
} from "../src/features/invoices/money";

describe("USD invoice money", () => {
  it("parses and formats cents", () => {
    expect(usdToCents("12.5")).toBe(1250n);
    expect(usdToCents("0.05")).toBe(5n);
    expect(usdToCents("1000")).toBe(100000n);
    expect(() => usdToCents("1.234")).toThrow();
    expect(() => usdToCents("-1")).toThrow();
    expect(centsToUsd(123456n)).toBe("$1,234.56");
    expect(centsToUsd(5n)).toBe("$0.05");
  });

  it("quotes ZEC rounding up, never short", () => {
    // $50.00 at $50.00/ZEC is exactly 1 ZEC.
    expect(quoteZat(5000n, priceMicro(50))).toBe(100_000_000n);
    // $10.00 at $30.00/ZEC = 0.333… ZEC, rounded up to the next zatoshi.
    expect(quoteZat(1000n, priceMicro(30))).toBe(33_333_334n);
    const zat = quoteZat(1999n, priceMicro(57.31));
    // Paying `zat` is worth at least $19.99 at that price.
    expect((zat * priceMicro(57.31)) / 100_000_000n >= 19_990_000n).toBe(true);
    expect(() => priceMicro(0)).toThrow();
  });
});
