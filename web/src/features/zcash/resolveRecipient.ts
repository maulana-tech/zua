import { verifyClaim } from "../../lib/profileClaim";
import { type AddressKind, addressKind } from "../../lib/zcash/address";
import { network } from "../../lib/zcash/network";
import { parsePaymentUri } from "../../lib/zcash/zip321";
import { api } from "../../trpc/client";

export type Recipient = {
  address: string;
  kind: AddressKind;
  username: string | null;
  amountZat?: bigint;
  memo?: string;
};

/**
 * Turns what the user typed (@username, a Zcash address, or a zcash: URI)
 * into a checked address. Usernames resolve through the server but are only
 * trusted after the owner's signature over the address verifies here.
 */
export async function resolveRecipient(input: string): Promise<Recipient> {
  const value = input.trim();
  if (value.startsWith("@") || /^[a-z0-9_]{3,20}$/i.test(value)) {
    const username = value.replace(/^@/, "").toLowerCase();
    const profile = await api.profiles.byUsername.query({ username });
    if (!profile) throw new Error(`@${username} doesn't exist.`);
    const claim = verifyClaim(profile.claimJson, profile.claimSigHex);
    if (!claim || claim.username !== username || claim.ua !== profile.ua)
      throw new Error(
        `@${username}'s address could not be verified. Don't send to it.`,
      );
    if (claim.network !== network)
      throw new Error(`@${username} is on another Zcash network.`);
    return { address: claim.ua, kind: "unified", username };
  }
  if (/^zcash:/i.test(value)) {
    const req = parsePaymentUri(value);
    const kind = addressKind(req.address, network);
    if (!kind) throw new Error("That payment request has an invalid address.");
    return {
      address: req.address,
      kind,
      username: null,
      amountZat: req.amountZat,
      memo: req.memo,
    };
  }
  const kind = addressKind(value, network);
  if (!kind) throw new Error("Enter a @username or a Zcash address.");
  return { address: value, kind, username: null };
}
