import { describe, expect, it } from "vitest";
import {
  canonicalClaim,
  type ProfileClaim,
  signClaim,
  signingPubkeyHex,
  verifyClaim,
} from "../src/lib/profileClaim";
import { profileSigningSeed } from "../src/lib/zcash/seed";
import { zecAmountInput } from "../src/server/modules/paymentLinks/paymentLinks.schema";

const seed = profileSigningSeed(new Uint8Array(32).fill(3));
const claim: ProfileClaim = {
  v: 1,
  username: "dinar",
  network: "main",
  ua: "u1examplexxxxxxxxxxxx",
  birthday: 3_500_000,
  signPubkeyHex: signingPubkeyHex(seed),
  issuedAt: "2026-10-14T00:00:00.000Z",
};

describe("profile claims", () => {
  it("verifies a claim signed by the owner's key", () => {
    const json = canonicalClaim(claim);
    expect(verifyClaim(json, signClaim(claim, seed))).toEqual(claim);
  });

  it("rejects a swapped address, a foreign key or a reordered JSON", () => {
    const sig = signClaim(claim, seed);
    const swapped = { ...claim, ua: "u1attackerxxxxxxxxxxx" };
    expect(verifyClaim(canonicalClaim(swapped), sig)).toBeNull();

    const other = profileSigningSeed(new Uint8Array(32).fill(4));
    const forged = { ...swapped, signPubkeyHex: signingPubkeyHex(other) };
    // A server that also swaps the key still can't reuse the owner's signature.
    expect(verifyClaim(canonicalClaim(forged), sig)).toBeNull();

    const reordered = JSON.stringify({ ...claim, v: undefined, v2: 1 });
    expect(verifyClaim(reordered, sig)).toBeNull();
    expect(verifyClaim("not json", sig)).toBeNull();
  });
});

describe("ZEC amount input", () => {
  it("turns decimal ZEC into zatoshi and empty into open amount", () => {
    expect(zecAmountInput.parse("0.8")).toBe("80000000");
    expect(zecAmountInput.parse("")).toBeNull();
    expect(zecAmountInput.parse(undefined)).toBeNull();
  });
  it("rejects zero, junk and too many decimals", () => {
    for (const bad of ["0", "abc", "0.000000001", "-1"])
      expect(zecAmountInput.safeParse(bad).success).toBe(false);
  });
});
