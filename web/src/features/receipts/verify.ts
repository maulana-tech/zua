import { type SignedAddress, verifiedAddress } from "../../lib/addressClaim";
import { type ProfileClaim, verifyClaim } from "../../lib/profileClaim";
import { orchardOnlyAddress } from "../../lib/zcash/unifiedAddress";
import { zatToZec } from "../../lib/zcash/units";
import { type Receipt, receiptSignatureValid } from "./receipt";

// Checks a receipt end to end. The chain and the profile service are passed
// in, so the logic is testable without a network.
export type VerifyDeps = {
  network: "main" | "test";
  profile: (
    username: string,
  ) => Promise<{ claimJson: string; claimSigHex: string } | null>;
  addressOwner: (
    ua: string,
  ) => Promise<{ username: string; signed: SignedAddress | null } | null>;
  rawTransaction: (
    txid: string,
  ) => Promise<{ data: Uint8Array; height: number } | null>;
  latestHeight: () => Promise<number>;
  verifyDisclosure: (opts: {
    tx: Uint8Array;
    height: number;
    pool: "orchard" | "ironwood";
    action: number;
    kEnc: string;
    ua: string;
  }) => Promise<{ value: bigint; memo: string }>;
};

export type VerifiedItem = {
  txid: string;
  height: number;
  amountZat: bigint;
  memo: string;
  confirmations: number;
  /** Username that registered the receiving address, if any. */
  recipient: string | null;
};

export type VerifyResult =
  | { status: "verified"; items: VerifiedItem[]; totalZat: bigint }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string };

const invalid = (reason: string): VerifyResult => ({
  status: "invalid",
  reason,
});

async function verifiedProfile(
  deps: VerifyDeps,
  username: string,
): Promise<ProfileClaim | null> {
  const p = await deps.profile(username);
  const claim = p ? verifyClaim(p.claimJson, p.claimSigHex) : null;
  return claim && claim.username === username ? claim : null;
}

/**
 * Username that registered `ua` with a valid signature, or null. A payment to
 * a profile address shows up as its Orchard-only form, so that counts too.
 */
async function ownerOf(deps: VerifyDeps, ua: string): Promise<string | null> {
  const owner = await deps.addressOwner(ua);
  if (!owner) return null;
  const claim = await verifiedProfile(deps, owner.username);
  if (!claim) return null;
  const address = verifiedAddress(claim, owner.signed);
  return address !== null &&
    (address === ua || orchardOnlyAddress(address) === ua)
    ? owner.username
    : null;
}

export async function verifyReceipt(
  receipt: Receipt,
  deps: VerifyDeps,
): Promise<VerifyResult> {
  if (receipt.network !== deps.network)
    return invalid(
      `This receipt is for Zcash ${receipt.network === "main" ? "mainnet" : "testnet"}.`,
    );
  const signer = await verifiedProfile(deps, receipt.signer);
  if (!signer || signer.network !== deps.network)
    return invalid(
      `@${receipt.signer} doesn't exist or its profile can't be verified.`,
    );
  if (!receiptSignatureValid(receipt, signer.signPubkeyHex))
    return invalid(
      "The signature doesn't match. The file was edited or not issued by this user.",
    );

  const seen = new Set<string>();
  const items: VerifiedItem[] = [];
  let tip: number;
  try {
    tip = await deps.latestHeight();
  } catch (e) {
    return {
      status: "unavailable",
      reason:
        e instanceof Error ? e.message : "Couldn't reach the Zcash network.",
    };
  }

  for (const item of receipt.items) {
    // A received payment must go to an address the signer registered first
    // (profile or per-invoice/link address), so nobody can pass off a
    // payment they sent to someone else as income.
    const recipient = await ownerOf(deps, item.recipientUa);
    if (receipt.kind !== "sent" && recipient !== receipt.signer)
      return invalid(
        `Payment ${item.txid.slice(0, 12)}… went to an address that isn't registered to @${receipt.signer}.`,
      );

    let raw: Awaited<ReturnType<VerifyDeps["rawTransaction"]>>;
    try {
      raw = await deps.rawTransaction(item.txid);
    } catch (e) {
      return {
        status: "unavailable",
        reason:
          e instanceof Error ? e.message : "Couldn't reach the Zcash network.",
      };
    }
    if (!raw)
      return invalid(
        `Transaction ${item.txid.slice(0, 12)}… isn't on the Zcash blockchain.`,
      );
    if (raw.height !== item.height)
      return invalid(
        `Transaction ${item.txid.slice(0, 12)}… is in block ${raw.height}, not ${item.height}.`,
      );

    let total = 0n;
    const memos: string[] = [];
    for (const d of item.disclosures) {
      const key = `${item.txid}:${d.pool}:${d.action}`;
      if (seen.has(key)) return invalid("An output is listed twice.");
      seen.add(key);
      try {
        const out = await deps.verifyDisclosure({
          tx: raw.data,
          height: raw.height,
          pool: d.pool,
          action: d.action,
          kEnc: d.kEnc,
          ua: item.recipientUa,
        });
        total += out.value;
        if (out.memo) memos.push(out.memo);
      } catch {
        return invalid(
          `An output of ${item.txid.slice(0, 12)}… doesn't pay that address the way the file says.`,
        );
      }
    }
    if (total.toString() !== item.amountZat)
      return invalid(
        `The chain shows ${zatToZec(total)} ZEC for ${item.txid.slice(0, 12)}…, not ${zatToZec(BigInt(item.amountZat))} ZEC.`,
      );
    const memo = memos.join("\n");
    if (memo !== item.memo)
      return invalid(
        `The memo for ${item.txid.slice(0, 12)}… doesn't match the chain.`,
      );
    items.push({
      txid: item.txid,
      height: item.height,
      amountZat: total,
      memo,
      confirmations: Math.max(0, tip - raw.height + 1),
      recipient,
    });
  }
  return {
    status: "verified",
    items,
    totalZat: items.reduce((t, i) => t + i.amountZat, 0n),
  };
}
