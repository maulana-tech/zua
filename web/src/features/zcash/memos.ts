import type { Disclosure, WalletTx } from "../../lib/zcash/wallet";

// Light-wallet sync only sees compact blocks, which carry no memos, so the
// wallet DB never learns what a received payment's memo says. Invoices, POS
// sales and requests are matched by memo tag, so after each sync the wallet
// fetches each new received transaction once and decrypts its memos on this
// device. Like every light wallet doing this, it tells lightwalletd which
// txids it asked for (the receipt flow already does the same).

/** Memos read so far, by txid. Kept in the device vault. */
export type MemoCache = Map<string, string[]>;

export const MEMO_CACHE_LIMIT = 1000;
/** Fetches per sync, so a long history doesn't stall the first sync. */
export const MEMO_FETCHES_PER_SYNC = 20;

/** Mined incoming transactions whose memos haven't been read yet, newest first. */
export function txidsNeedingMemos(
  history: WalletTx[],
  cache: MemoCache,
  max = MEMO_FETCHES_PER_SYNC,
): string[] {
  return history
    .filter(
      (tx) =>
        tx.kind === "received" &&
        tx.height !== null &&
        tx.memos.length === 0 &&
        !cache.has(tx.txid),
    )
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
    .slice(0, max)
    .map((tx) => tx.txid);
}

/** Text memos of the outputs paying this account (change excluded). */
export function receivedMemos(disclosures: Disclosure[]): string[] {
  return disclosures
    .filter((d) => d.direction === "received" && !d.internal && d.memo)
    .map((d) => d.memo);
}

/** `history` with memos from `cache` filled in where the wallet had none. */
export function withMemos(history: WalletTx[], cache: MemoCache): WalletTx[] {
  return history.map((tx) => {
    const memos = tx.memos.length ? undefined : cache.get(tx.txid);
    return memos?.length ? { ...tx, memos } : tx;
  });
}

/** Most recent entries last, capped, for the vault. */
export function memoCacheEntries(cache: MemoCache): [string, string[]][] {
  return [...cache].slice(-MEMO_CACHE_LIMIT);
}
