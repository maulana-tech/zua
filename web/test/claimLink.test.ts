import { describe, expect, it } from "vitest";
import {
  claimLinkUrl,
  claimMnemonic,
  parseClaimFragment,
} from "../src/features/claims/link";
import { claimLinkKey } from "../src/lib/zcash/seed";

const master = new Uint8Array(32).fill(7);

describe("claim links", () => {
  it("derives a distinct, stable key per link", () => {
    expect(claimLinkKey(master, 0)).toEqual(claimLinkKey(master, 0));
    expect(claimLinkKey(master, 0)).not.toEqual(claimLinkKey(master, 1));
    expect(claimMnemonic(claimLinkKey(master, 0)).split(" ")).toHaveLength(24);
  });

  it("round-trips through the URL fragment", () => {
    const link = {
      key: claimLinkKey(master, 3),
      amountZat: 12_500_000n,
      birthday: 3_517_000,
      description: "Thanks for the help & coffee",
    };
    const url = claimLinkUrl("https://zua.example", link);
    expect(url.startsWith("https://zua.example/claim#k=")).toBe(true);
    expect(parseClaimFragment(new URL(url).hash)).toEqual(link);
  });

  it("rejects damaged links", () => {
    expect(() => parseClaimFragment("#k=zz&a=1&b=1")).toThrow();
    expect(() =>
      parseClaimFragment(`#k=${"ab".repeat(32)}&a=oops&b=10`),
    ).toThrow();
    expect(() => parseClaimFragment(`#k=${"ab".repeat(32)}&a=1`)).toThrow();
  });
});
