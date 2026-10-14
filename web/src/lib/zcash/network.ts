import { env } from "../../env";

export type ZcashNetwork = "main" | "test";

export const network: ZcashNetwork = env.NEXT_PUBLIC_ZCASH_NETWORK;
export const lightwalletdUrl = env.NEXT_PUBLIC_LIGHTWALLETD_URL;
export const minConfirmations = env.NEXT_PUBLIC_MIN_CONFIRMATIONS;

export function explorerTxUrl(txid: string): string | null {
  const template = env.NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL;
  return template ? template.replace("{txid}", txid) : null;
}
