"use client";

import { useMemo, useState } from "react";
import { receiptFilename } from "../../features/receipts/receipt";
import { formatUsd, useZecPrice } from "../../features/zcash/useZecPrice";
import { downloadText } from "../../lib/download";
import { unlockLabel } from "../../lib/passkey";
import { zatToZec } from "../../lib/zcash/units";
import { useWallet } from "../WalletProvider";
import { ActivityFeed } from "./ActivityFeed";
import { DashboardNotice } from "./DashboardNotice";
import { DashboardPageHeader } from "./DashboardPageHeader";
import { StatementPanel } from "./StatementPanel";
import { dashButtonPrimary, dashCell, dashLedger } from "./styles";

export function HistoryDashboard() {
  const { accountUnlocked, promptUnlock, recoveryMethod, zcash, issueReceipt } =
    useWallet();
  const price = useZecPrice();
  const [receiptError, setReceiptError] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
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
        description="Every shielded payment in and out, decrypted on this device. Download a receipt for a payment you received, or a proof of payment for one you sent: each proves the amount on chain without revealing your other payments."
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
          {receiptBusy ? (
            <p className="text-sm text-(--dash-ash)" aria-live="polite">
              Building the proof from the chain…
            </p>
          ) : receiptError ? (
            <p className="text-sm text-destructive" role="alert">
              {receiptError}
            </p>
          ) : null}
          <div className={dashLedger}>
            <div className={dashCell}>
              <ActivityFeed
                history={zcash.history}
                loading={
                  zcash.status === "loading" || zcash.status === "syncing"
                }
                onReceipt={async (tx) => {
                  if (receiptBusy) return;
                  setReceiptError("");
                  setReceiptBusy(true);
                  let receipt: Awaited<ReturnType<typeof issueReceipt>>;
                  try {
                    receipt = await issueReceipt(tx);
                  } catch (e) {
                    setReceiptError(
                      e instanceof Error
                        ? e.message
                        : "Couldn't build the receipt.",
                    );
                    return;
                  } finally {
                    setReceiptBusy(false);
                  }
                  downloadText(
                    receiptFilename(receipt),
                    JSON.stringify(receipt, null, 2),
                    "application/json",
                  );
                }}
              />
            </div>
          </div>
          <div className={dashLedger}>
            <StatementPanel />
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
