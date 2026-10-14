"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { network } from "../../lib/zcash/network";
import { useWallet } from "../WalletProvider";
import { dashButtonSecondary, dashCell } from "./styles";

/** Shielded address plus an export of the 24 words for any Zcash wallet. */
export function ZcashWalletTile() {
  const { zcash, accountUnlocked, revealMnemonic } = useWallet();
  const [copied, setCopied] = useState(false);
  const [words, setWords] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section className={`${dashCell} p-6`}>
      <h2 className="dashboard-tile-title">Zcash wallet</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-(--dash-ash)">
        Your shielded address on Zcash{" "}
        {network === "main" ? "mainnet" : "testnet"}. It receives to the Orchard
        pool, so payments hide the sender, recipient and amount.
      </p>
      {zcash.address ? (
        <div className="mt-4 grid gap-3">
          <p className="break-all rounded-(--dash-radius-sm) border border-(--dash-line) bg-(--dash-tint) p-3 font-mono text-[11px] leading-5">
            {zcash.address}
          </p>
          <button
            type="button"
            className={`${dashButtonSecondary} justify-self-start`}
            onClick={async () => {
              await navigator.clipboard?.writeText(zcash.address ?? "");
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy address"}
          </button>
        </div>
      ) : null}

      {accountUnlocked ? (
        <div className="mt-6 border-t border-(--dash-line) pt-5">
          <h3 className="text-sm font-medium">
            Back up to another Zcash wallet
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-(--dash-ash)">
            These 24 words open the same wallet in Zodl or any Zcash wallet,
            even if this app disappears. Anyone who sees them can spend your
            funds.
          </p>
          {words ? (
            <div className="mt-4 grid gap-3">
              <ol className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-(--dash-radius-sm) border border-(--dash-line-strong) p-4 font-mono text-xs sm:grid-cols-3">
                {words.split(" ").map((w, i) => (
                  <li key={`${i}-${w}`}>
                    <span className="mr-2 text-(--dash-ash)">{i + 1}.</span>
                    {w}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className={`${dashButtonSecondary} justify-self-start`}
                onClick={() => setWords(null)}
              >
                <EyeOff aria-hidden="true" />
                Hide words
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I&apos;m in a private place and won&apos;t screenshot or share
                these words.
              </label>
              <button
                type="button"
                className={`${dashButtonSecondary} justify-self-start`}
                disabled={!confirmed}
                onClick={() => setWords(revealMnemonic())}
              >
                <Eye aria-hidden="true" />
                Show 24 words
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
