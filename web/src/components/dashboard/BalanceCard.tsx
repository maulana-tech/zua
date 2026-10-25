"use client";

import { ArrowDownLeft, ArrowUpRight, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useFiat } from "../../features/zcash/useZecPrice";
import { SEND_PATH } from "../../lib/auth-routes";
import { zatToZec } from "../../lib/zcash/units";
import type { ZcashState } from "../WalletProvider";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashIconButton,
} from "./styles";

function syncLabel(z: ZcashState): string {
  if (z.status === "loading") return "Opening wallet…";
  if (z.status === "error") return z.error ?? "Sync failed";
  if (z.sync && z.sync.tip > z.sync.scanned)
    return `Syncing · ${z.sync.tip - z.sync.scanned} blocks left`;
  if (z.status === "syncing") return "Syncing…";
  if (z.lastSyncedAt)
    return `Up to date · block ${z.sync?.tip.toLocaleString("en-US") ?? "–"}`;
  return "Not synced yet";
}

export function BalanceCard({
  zcash,
  locked,
  unlockLabel,
  onUnlock,
  onReceive,
  onSync,
}: {
  zcash: ZcashState;
  locked: boolean;
  unlockLabel: string;
  onUnlock: () => void;
  onReceive?: () => void;
  onSync: () => void;
}) {
  const fiat = useFiat();
  const spendable = zcash.balances?.spendable ?? null;
  const pending =
    (zcash.balances?.pendingChange ?? 0n) +
    (zcash.balances?.pendingSpendable ?? 0n);
  const busy = zcash.status === "syncing" || zcash.status === "loading";

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="dashboard-tile-title">Shielded balance</h2>
        {locked ? (
          <Lock className="size-4 text-(--dash-ash)" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className={dashIconButton}
            onClick={onSync}
            disabled={busy}
            aria-label="Sync wallet"
          >
            <RefreshCw
              className={busy ? "motion-safe:animate-spin" : undefined}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {locked ? (
        <>
          <p className="mt-6 text-[clamp(2.4rem,5vw,3.6rem)] leading-none tracking-tight text-(--dash-fg)/25">
            ••• ZEC
          </p>
          <p className="mt-4 max-w-md text-sm leading-6 text-(--dash-ash)">
            Your keys stay on this device. Unlock to read your balance from the
            Zcash blockchain.
          </p>
          <div className="mt-6">
            <button
              type="button"
              className={dashButtonPrimary}
              onClick={onUnlock}
            >
              <Lock aria-hidden="true" />
              {unlockLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <p
            className="mt-6 text-[clamp(2.4rem,5vw,3.6rem)] leading-none tracking-tight tabular-nums"
            aria-live="polite"
          >
            {spendable === null ? "—" : zatToZec(spendable)}{" "}
            <span className="text-[0.45em] text-(--dash-ash)">ZEC</span>
          </p>
          <p className="mt-2 text-sm text-(--dash-ash) tabular-nums">
            {spendable !== null ? fiat.format(spendable) : null}
            {pending > 0n ? ` · ${zatToZec(pending)} ZEC confirming` : null}
          </p>
          <p className="mt-4 text-xs text-(--dash-ash)" role="status">
            {syncLabel(zcash)}
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            {onReceive ? (
              <button
                type="button"
                className={dashButtonPrimary}
                onClick={onReceive}
              >
                <ArrowDownLeft aria-hidden="true" />
                Receive
              </button>
            ) : null}
            <Link href={SEND_PATH} className={dashButtonSecondary}>
              <ArrowUpRight aria-hidden="true" />
              Send
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
