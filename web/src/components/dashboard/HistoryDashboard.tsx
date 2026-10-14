"use client";

import { useMemo } from "react";
import { formatUsd, useZecPrice } from "../../features/zcash/useZecPrice";
import { unlockLabel } from "../../lib/passkey";
import { zatToZec } from "../../lib/zcash/units";
import { useWallet } from "../WalletProvider";
import { ActivityFeed } from "./ActivityFeed";
import { DashboardNotice } from "./DashboardNotice";
import { DashboardPageHeader } from "./DashboardPageHeader";
import { dashButtonPrimary, dashCell, dashLedger } from "./styles";

export function HistoryDashboard() {
  const { accountUnlocked, promptUnlock, recoveryMethod, zcash } = useWallet();
  const price = useZecPrice();
  const totals = useMemo(() => {
    let received = 0n;
    let sent = 0n;
    for (const tx of zcash.history) {
      if (tx.kind === "received") received += tx.value;
      if (tx.kind === "sent") sent += -tx.value;
    }
    return { received, sent, count: zcash.history.length };
  }, [zcash.history]);

  return (
    <>
      <DashboardPageHeader
        title="History"
        description="Every shielded payment in and out, decrypted on this device."
      />
      {accountUnlocked ? (
        <div className="grid gap-4">
          <dl className={`${dashLedger} sm:grid-cols-3`}>
            {[
              ["Total received", totals.received],
              ["Total sent", totals.sent],
            ].map(([label, zat]) => (
              <div key={label as string} className={`${dashCell} p-5`}>
                <dt className="dashboard-tile-title">{label as string}</dt>
                <dd className="mt-3 text-2xl tabular-nums">
                  {zatToZec(zat as bigint)} ZEC
                </dd>
                <dd className="mt-1 text-xs text-(--dash-ash)">
                  {formatUsd(zat as bigint, price)}
                </dd>
              </div>
            ))}
            <div className={`${dashCell} p-5`}>
              <dt className="dashboard-tile-title">Transactions</dt>
              <dd className="mt-3 text-2xl tabular-nums">{totals.count}</dd>
            </div>
          </dl>
          <div className={dashLedger}>
            <div className={dashCell}>
              <ActivityFeed
                history={zcash.history}
                loading={
                  zcash.status === "loading" || zcash.status === "syncing"
                }
              />
            </div>
          </div>
        </div>
      ) : (
        <DashboardNotice
          label="Locked"
          title="Unlock to view history"
          action={
            <button
              type="button"
              className={dashButtonPrimary}
              onClick={promptUnlock}
            >
              {unlockLabel(recoveryMethod)}
            </button>
          }
        >
          Your payment records are encrypted on the blockchain. Only this
          device, after you unlock, can read them.
        </DashboardNotice>
      )}
    </>
  );
}
