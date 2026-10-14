import { env } from "../../env";

export type ZcashNetwork = "main" | "test";

export const network: ZcashNetwork = env.NEXT_PUBLIC_ZCASH_NETWORK;
export const isTestnet = network === "test";
export const lightwalletdUrl =
  env.NEXT_PUBLIC_LIGHTWALLETD_URL ??
  (isTestnet
    ? "https://zcash-testnet.chainsafe.dev"
    : "https://zcash-mainnet.chainsafe.dev");
export const minConfirmations = env.NEXT_PUBLIC_MIN_CONFIRMATIONS;

export function explorerTxUrl(txid: string): string | null {
  const template =
    env.NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL ??
    (isTestnet
      ? "https://testnet.zcashexplorer.app/transactions/{txid}"
      : "https://mainnet.zcashexplorer.app/transactions/{txid}");
  return template ? template.replace("{txid}", txid) : null;
}
