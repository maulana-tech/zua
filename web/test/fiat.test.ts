import { defaultFiat, formatFiat, isFiatCode } from "../src/lib/fiat";

describe("display currency", () => {
  it("picks a currency from the browser locale", () => {
    expect(defaultFiat("id-ID")).toBe("IDR");
    expect(defaultFiat("id")).toBe("IDR");
    expect(defaultFiat("en-SG")).toBe("SGD");
    expect(defaultFiat("de-DE")).toBe("EUR");
    expect(defaultFiat("zh-Hant-TW")).toBe("TWD");
    expect(defaultFiat("en_GB")).toBe("GBP");
    expect(defaultFiat("en")).toBe("USD");
    expect(defaultFiat("xx-ZZ")).toBe("USD");
    expect(defaultFiat(undefined)).toBe("USD");
  });

  it("knows only the supported codes", () => {
    expect(isFiatCode("IDR")).toBe(true);
    expect(isFiatCode("idr")).toBe(false);
    expect(isFiatCode("XYZ")).toBe(false);
    expect(isFiatCode(null)).toBe(false);
  });

  it("drops decimals for rupiah and large amounts", () => {
    const plain = (s: string) => s.replace(/\s/g, " ");
    expect(plain(formatFiat(21572.4, "IDR", "id-ID"))).toBe("Rp 21.572");
    expect(formatFiat(12.345, "USD", "en-US")).toBe("$12.35");
    expect(formatFiat(1192.27, "USD", "en-US")).toBe("$1,192");
    expect(formatFiat(0.5, "EUR", "en-US")).toBe("€0.50");
  });
});
