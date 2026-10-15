import type { SendStage, ZcashWallet } from "../../lib/zcash/wallet";
import { type ClaimLink, claimMnemonic } from "./link";

// The throwaway wallet behind a claim link, opened in the browser of whoever
// holds the link (recipient, or the sender cancelling it).

export type ClaimStatus =
  | { kind: "waiting" } // nothing received yet
  | { kind: "pending"; amountZat: bigint } // received, not yet spendable
  | { kind: "ready"; amountZat: bigint }
  | { kind: "claimed" }; // funds already swept out

export type ClaimWallet = { wallet: ZcashWallet; mnemonic: string };

export async function openClaimWallet(
  link: Pick<ClaimLink, "key" | "birthday">,
): Promise<ClaimWallet> {
  const { ZcashWallet } = await import("../../lib/zcash/wallet");
  const mnemonic = claimMnemonic(link.key);
  // Scan from just before the link was funded: a few blocks, not years.
  const wallet = await ZcashWallet.open({
    mnemonic,
    birthday: link.birthday,
  });
  return { wallet, mnemonic };
}

/** The link wallet's receiving address (where the sender funds it). */
export const claimAddress = (c: ClaimWallet) => c.wallet.address();

export async function claimStatus(c: ClaimWallet): Promise<ClaimStatus> {
  await c.wallet.sync();
  const [{ balances }, history] = await Promise.all([
    c.wallet.status(),
    c.wallet.history(),
  ]);
  if (balances.spendable > 0n)
    return { kind: "ready", amountZat: balances.spendable };
  const pending = balances.pendingSpendable + balances.pendingChange;
  if (pending > 0n) return { kind: "pending", amountZat: pending };
  return history.some((tx) => tx.kind === "sent")
    ? { kind: "claimed" }
    : { kind: "waiting" };
}

/**
 * Sends everything in the link wallet to `to`, the ZIP-317 fee taken from
 * it. Returns the txids and the amount `to` receives.
 */
export async function sweepClaim(
  c: ClaimWallet,
  to: string,
  onStage?: (stage: SendStage) => void,
): Promise<{ txids: string[]; amountZat: bigint }> {
  onStage?.("proposing");
  const proposed = await c.wallet.proposeSendMax(to);
  const txids = await c.wallet.prove(proposed.proposal, c.mnemonic, onStage);
  return { txids, amountZat: proposed.sendZat };
}
