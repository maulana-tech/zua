import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { bytesToHex, hexToBytes } from "../../lib/crypto";
import { zatToZec, zecToZat } from "../../lib/zcash/units";

// Claim links, after ZIP 324 (URI-Encapsulated Payments, draft): the sender
// funds a throwaway wallet and shares its key in a link. Whoever opens the
// link sweeps the funds into their own wallet; until then the sender can
// sweep them back. The key sits in the URL fragment, which browsers never
// send to a server.
//
//   https://<app>/claim#k=<64 hex>&a=<ZEC>&b=<birthday height>&d=<note>
//
// ZIP 324 itself is Sapling-only and still a draft without a fixed note
// derivation, so this format is Zua's own and funds sit in the shielded
// (Ironwood) pool.

export type ClaimLink = {
  key: Uint8Array; // 32 bytes
  amountZat: bigint; // what the sender says it holds
  birthday: number; // chain height before funding, where the scan starts
  description: string;
};

/** ZIP-317 fee to sweep one note (two padded actions). Added on funding. */
export const CLAIM_SWEEP_FEE_ZAT = 10_000n;

export function claimLinkUrl(origin: string, link: ClaimLink): string {
  const params = new URLSearchParams({
    k: bytesToHex(link.key),
    a: zatToZec(link.amountZat),
    b: String(link.birthday),
  });
  if (link.description) params.set("d", link.description);
  return `${origin}/claim#${params.toString()}`;
}

export function parseClaimFragment(hash: string): ClaimLink {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const k = params.get("k") ?? "";
  const b = Number(params.get("b"));
  if (!/^[0-9a-f]{64}$/.test(k) || !Number.isInteger(b) || b <= 0)
    throw new Error("This claim link is incomplete or damaged.");
  let amountZat: bigint;
  try {
    amountZat = zecToZat(params.get("a") ?? "");
  } catch {
    throw new Error("This claim link is incomplete or damaged.");
  }
  return {
    key: hexToBytes(k),
    amountZat,
    birthday: b,
    description: (params.get("d") ?? "").slice(0, 200),
  };
}

/** The throwaway wallet's 24-word seed. */
export const claimMnemonic = (key: Uint8Array) =>
  entropyToMnemonic(key, wordlist);
