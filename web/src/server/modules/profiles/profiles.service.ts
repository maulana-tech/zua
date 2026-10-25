import "server-only";
import type { MongoServerError } from "mongodb";
import { env } from "../../../env";
import { type SignedAddress, verifiedAddress } from "../../../lib/addressClaim";
import { verifyClaim } from "../../../lib/profileClaim";
import { addressKind } from "../../../lib/zcash/address";
import { orchardOnlyAddress } from "../../../lib/zcash/unifiedAddress";
import {
  getPayAddresses,
  getProfiles,
  getUsers,
  type ProfileDoc,
} from "../../db/mongo";
import {
  InvalidClaimError,
  InvalidPayAddressError,
  ProfileExistsError,
  UsernameTakenError,
} from "./profiles.errors";
import {
  type CreateProfileInput,
  isReservedUsername,
  type PublicProfile,
  usernameSchema,
} from "./profiles.schema";

const toPublic = (doc: ProfileDoc): PublicProfile => ({
  username: doc._id,
  network: doc.network,
  ua: doc.ua,
  birthday: doc.birthday,
  signPubkeyHex: doc.signPubkeyHex,
  msgPubkeyHex: doc.msgPubkeyHex,
  claimJson: doc.claimJson,
  claimSigHex: doc.claimSigHex,
});

export async function createProfile(
  userId: string,
  input: CreateProfileInput,
): Promise<PublicProfile> {
  const claim = verifyClaim(input.claimJson, input.claimSigHex.toLowerCase());
  if (!claim) throw new InvalidClaimError("bad signature");
  const username = usernameSchema.safeParse(claim.username);
  if (!username.success || username.data !== claim.username)
    throw new InvalidClaimError("invalid username");
  if (isReservedUsername(claim.username)) throw new UsernameTakenError();
  if (claim.network !== env.NEXT_PUBLIC_ZCASH_NETWORK)
    throw new InvalidClaimError("wrong network");
  if (!/^[0-9a-f]{64}$/.test(claim.msgPubkeyHex ?? ""))
    throw new InvalidClaimError("invalid messaging key");
  if (addressKind(claim.ua, claim.network) !== "unified")
    throw new InvalidClaimError("address must be a unified address");

  // The claim must be signed by the key this account's recovery reproduces.
  const user = await (await getUsers()).findOne({ _id: userId });
  if (!user?.escrow && !user?.passkey)
    throw new InvalidClaimError("set up recovery first");
  if (user.passkey && user.passkey.signPubkeyHex !== claim.signPubkeyHex)
    throw new InvalidClaimError("signing key does not match your passkey");

  const profiles = await getProfiles();
  if (await profiles.findOne({ userId })) throw new ProfileExistsError();
  const doc: ProfileDoc = {
    _id: claim.username,
    userId,
    network: claim.network,
    ua: claim.ua,
    orchardUa: orchardOnlyAddress(claim.ua),
    birthday: claim.birthday,
    signPubkeyHex: claim.signPubkeyHex,
    msgPubkeyHex: claim.msgPubkeyHex,
    claimJson: input.claimJson,
    claimSigHex: input.claimSigHex.toLowerCase(),
    createdAt: new Date(),
  };
  try {
    await profiles.insertOne(doc);
  } catch (e) {
    if ((e as MongoServerError).code === 11000) {
      if (await profiles.findOne({ userId })) throw new ProfileExistsError();
      throw new UsernameTakenError();
    }
    throw e;
  }
  return toPublic(doc);
}

export async function profileByUsername(
  username: string,
): Promise<PublicProfile | null> {
  const doc = await (await getProfiles()).findOne({ _id: username });
  return doc ? toPublic(doc) : null;
}

export async function myProfile(userId: string): Promise<PublicProfile | null> {
  const doc = await (await getProfiles()).findOne({ userId });
  return doc ? toPublic(doc) : null;
}

export async function usernameAvailable(username: string): Promise<boolean> {
  if (isReservedUsername(username)) return false;
  return !(await (await getProfiles()).findOne({ _id: username }));
}

/** Owner username for a Privy user, or throws for callers that need one. */
export async function requireUsername(userId: string): Promise<string> {
  const doc = await (await getProfiles()).findOne({ userId });
  if (!doc) throw new InvalidClaimError("create your username first");
  return doc._id;
}

/**
 * Checks a per-invoice/link address the owner signed (see lib/addressClaim)
 * against their stored profile claim, then registers it to them. An address
 * already registered (or used as a profile address) by someone else is
 * refused, which is what keeps receipts for it sound.
 */
export async function checkPayAddress(
  owner: string,
  signed: SignedAddress,
): Promise<SignedAddress> {
  const profiles = await getProfiles();
  const doc = await profiles.findOne({ _id: owner });
  const claim = doc ? verifyClaim(doc.claimJson, doc.claimSigHex) : null;
  const ua = claim ? verifiedAddress(claim, signed) : null;
  if (!claim || !ua || addressKind(ua, claim.network) !== "unified")
    throw new InvalidPayAddressError();
  if (await profiles.findOne({ ua, _id: { $ne: owner } }))
    throw new InvalidPayAddressError();
  const registry = await getPayAddresses();
  try {
    await registry.insertOne({
      _id: ua,
      orchardUa: orchardOnlyAddress(ua),
      owner,
      claimJson: signed.claimJson,
      sigHex: signed.sigHex,
      createdAt: new Date(),
    });
  } catch (e) {
    if ((e as MongoServerError).code !== 11000) throw e;
    const existing = await registry.findOne({ _id: ua });
    if (existing?.owner !== owner) throw new InvalidPayAddressError();
  }
  return { claimJson: signed.claimJson, sigHex: signed.sigHex };
}

/**
 * Who registered `ua`: its profile owner, or the owner of the signed
 * per-invoice/link address. Payers and verifiers recheck the signature.
 */
export async function addressOwner(ua: string): Promise<{
  username: string;
  signed: SignedAddress | null;
} | null> {
  // Receipts name a payment by its Orchard receiver, as an Orchard-only
  // address; a profile or pay address with a Sapling receiver too is longer.
  const profile = await (await getProfiles()).findOne({
    $or: [{ ua }, { orchardUa: ua }],
  });
  if (profile) return { username: profile._id, signed: null };
  const doc = await (await getPayAddresses()).findOne({
    $or: [{ _id: ua }, { orchardUa: ua }],
  });
  return doc
    ? {
        username: doc.owner,
        signed: { claimJson: doc.claimJson, sigHex: doc.sigHex },
      }
    : null;
}
