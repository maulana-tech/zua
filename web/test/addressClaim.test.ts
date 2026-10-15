import { describe, expect, it } from "vitest";
import {
  type AddressClaim,
  signAddressClaim,
  verifiedAddress,
} from "../src/lib/addressClaim";
import { type ProfileClaim, signingPubkeyHex } from "../src/lib/profileClaim";
import { profileSigningSeed } from "../src/lib/zcash/seed";

const seed = profileSigningSeed(new Uint8Array(32).fill(5));
const profile: ProfileClaim = {
  v: 1,
  username: "dinar",
  network: "main",
  ua: "u1profilexxxxxxxxxxxx",
  birthday: 3_500_000,
  signPubkeyHex: signingPubkeyHex(seed),
  msgPubkeyHex: "ab".repeat(32),
  issuedAt: "2026-10-15T00:00:00.000Z",
};
const claim: AddressClaim = {
  v: 1,
  username: "dinar",
  network: "main",
  ua: "u1invoiceaddressxxxxx",
  issuedAt: "2026-10-15T01:00:00.000Z",
};

describe("per-invoice address claims", () => {
  it("returns the signed address, or the profile address when none is set", () => {
    expect(verifiedAddress(profile, signAddressClaim(claim, seed))).toBe(
      claim.ua,
    );
    expect(verifiedAddress(profile, null)).toBe(profile.ua);
  });

  it("rejects another key, another user, another network or an edit", () => {
    const other = profileSigningSeed(new Uint8Array(32).fill(6));
    expect(verifiedAddress(profile, signAddressClaim(claim, other))).toBeNull();
    expect(
      verifiedAddress(
        profile,
        signAddressClaim({ ...claim, username: "mallory" }, seed),
      ),
    ).toBeNull();
    expect(
      verifiedAddress(
        profile,
        signAddressClaim({ ...claim, network: "test" }, seed),
      ),
    ).toBeNull();
    const signed = signAddressClaim(claim, seed);
    expect(
      verifiedAddress(profile, {
        ...signed,
        claimJson: signed.claimJson.replace("invoice", "attacker"),
      }),
    ).toBeNull();
  });
});
