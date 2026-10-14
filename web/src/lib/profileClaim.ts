import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "./crypto";

// A profile claim binds @username to a Zcash address and is signed by a key
// only the owner's browser can derive. The server stores it but cannot forge
// it, so payers check the signature before showing a payment QR.
export type ProfileClaim = {
  v: 1;
  username: string;
  network: "main" | "test";
  ua: string;
  birthday: number;
  signPubkeyHex: string;
  issuedAt: string; // ISO timestamp
};

const FIELDS: (keyof ProfileClaim)[] = [
  "v",
  "username",
  "network",
  "ua",
  "birthday",
  "signPubkeyHex",
  "issuedAt",
];

/** Fixed field order, no whitespace: the exact bytes that get signed. */
export function canonicalClaim(claim: ProfileClaim): string {
  return JSON.stringify(Object.fromEntries(FIELDS.map((k) => [k, claim[k]])));
}

const encode = (text: string) => new TextEncoder().encode(text);

export function signingPubkeyHex(seed: Uint8Array): string {
  return bytesToHex(ed25519.getPublicKey(seed));
}

export function signClaim(claim: ProfileClaim, seed: Uint8Array): string {
  return bytesToHex(ed25519.sign(encode(canonicalClaim(claim)), seed));
}

/** Parses and verifies a stored claim; null when anything is off. */
export function verifyClaim(
  claimJson: string,
  sigHex: string,
): ProfileClaim | null {
  let claim: ProfileClaim;
  try {
    claim = JSON.parse(claimJson) as ProfileClaim;
  } catch {
    return null;
  }
  if (claim?.v !== 1 || canonicalClaim(claim) !== claimJson) return null;
  try {
    return ed25519.verify(
      hexToBytes(sigHex),
      encode(claimJson),
      hexToBytes(claim.signPubkeyHex),
    )
      ? claim
      : null;
  } catch {
    return null;
  }
}
