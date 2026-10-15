import "server-only";
import { newMemoId } from "../../../lib/zcash/memo";
import { type ClaimLinkDoc, getClaimLinks, getProfiles } from "../../db/mongo";
import { ClaimLinkNotFoundError } from "./claimLinks.errors";
import type { ClaimLinkView } from "./claimLinks.schema";

const toView = (d: ClaimLinkDoc): ClaimLinkView => ({
  id: d._id,
  index: d.index,
  amountZat: d.amountZat,
  description: d.description,
  birthday: d.birthday,
  fundTxid: d.fundTxid,
  state: d.state,
  createdAt: d.createdAt.toISOString(),
});

/** Reserves the next key index for `owner` (never reused) and records it. */
export async function createClaimLink(
  owner: string,
  input: { amountZat: string; description: string; birthday: number },
): Promise<ClaimLinkView> {
  const profile = await (await getProfiles()).findOneAndUpdate(
    { _id: owner },
    { $inc: { claimLinkCount: 1 } },
    { returnDocument: "before" },
  );
  if (!profile) throw new ClaimLinkNotFoundError();
  const now = new Date();
  const doc: ClaimLinkDoc = {
    _id: newMemoId(),
    owner,
    index: profile.claimLinkCount ?? 0,
    amountZat: input.amountZat,
    description: input.description,
    birthday: input.birthday,
    fundTxid: null,
    state: "funding",
    createdAt: now,
    updatedAt: now,
  };
  await (await getClaimLinks()).insertOne(doc);
  return toView(doc);
}

export async function markClaimLinkFunded(
  owner: string,
  id: string,
  txid: string,
): Promise<ClaimLinkView> {
  const doc = await (await getClaimLinks()).findOneAndUpdate(
    { _id: id, owner, state: "funding" },
    { $set: { fundTxid: txid, state: "active", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new ClaimLinkNotFoundError();
  return toView(doc);
}

export async function cancelClaimLink(
  owner: string,
  id: string,
): Promise<ClaimLinkView> {
  const doc = await (await getClaimLinks()).findOneAndUpdate(
    { _id: id, owner },
    { $set: { state: "cancelled", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new ClaimLinkNotFoundError();
  return toView(doc);
}

export async function listClaimLinks(owner: string): Promise<ClaimLinkView[]> {
  const docs = await (await getClaimLinks())
    .find({ owner })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  return docs.map(toView);
}
