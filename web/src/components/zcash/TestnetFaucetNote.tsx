"use client";

import { isTestnet } from "@/lib/zcash/network";

/**
 * Testnet builds start with an empty wallet. Point people at the faucet where
 * they open the app, so a new account is not stuck at a zero balance.
 */
export function TestnetFaucetNote({ className }: { className?: string }) {
  if (!isTestnet) return null;
  return (
    <p className={className}>
      Testing on testnet? This wallet starts empty. Claim free TAZ from the{" "}
      <a
        href="https://fauzec.com"
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline decoration-current/40 underline-offset-4 hover:decoration-current"
      >
        Fauzec faucet
      </a>{" "}
      (1 TAZ per address every 24 hours), then send it to your address.
    </p>
  );
}
