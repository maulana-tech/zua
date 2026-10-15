import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "./crypto";
import type { ProfileClaim } from "./profileClaim";

// Each invoice and payment link gets its own diversified address, so two
// clients can't tell they paid the same person. The owner signs
// "@username receives at <ua>" with the same key as their profile claim; a
// payer checks it against that verified profile before showing a QR, so the
// server still can't substitute an address.
export type AddressClaim = {
  v: 1;
  username: string;
  network: "main" | "test";
  ua: string;
  issuedAt: string;
};

export type SignedAddress = { claimJson: string; sigHex: string };

const FIELDS: (keyof AddressClaim)[] = [
  "v",
  "username",
  "network",
  "ua",
  "issuedAt",
];

const encode = (text: string) => new TextEncoder().encode(text);

export function canonicalAddressClaim(claim: AddressClaim): string {
  return JSON.stringify(Object.fromEntries(FIELDS.map((k) => [k, claim[k]])));
}

export function signAddressClaim(
  claim: AddressClaim,
  seed: Uint8Array,
): SignedAddress {
  const claimJson = canonicalAddressClaim(claim);
  return {
    claimJson,
    sigHex: bytesToHex(ed25519.sign(encode(claimJson), seed)),
  };
}

/**
 * The address to pay, given an owner's verified profile and an optional
 * per-invoice/link address. Null when the signed address doesn't check out:
 * then nothing should be shown rather than falling back silently.
 */
export function verifiedAddress(
  profile: ProfileClaim,
  signed: SignedAddress | null | undefined,
): string | null {
  if (!signed) return profile.ua;
  let claim: AddressClaim;
  try {
    claim = JSON.parse(signed.claimJson) as AddressClaim;
  } catch {
    return null;
  }
  if (
    claim?.v !== 1 ||
    canonicalAddressClaim(claim) !== signed.claimJson ||
    claim.username !== profile.username ||
    claim.network !== profile.network
  )
    return null;
  try {
    return ed25519.verify(
      hexToBytes(signed.sigHex),
      encode(signed.claimJson),
      hexToBytes(profile.signPubkeyHex),
    )
      ? claim.ua
      : null;
  } catch {
    return null;
  }
}
