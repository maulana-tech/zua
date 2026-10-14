"use client";

import { Check, ChevronRight, Copy, ExternalLink, QrCode } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { InstallApp } from "../../features/pwa/InstallApp";
import { LINKS_PATH } from "../../lib/auth-routes";
import { APP_NAME } from "../../lib/brand";
import { unlockLabel } from "../../lib/passkey";
import { useWallet } from "../WalletProvider";
import { ActivityFeed } from "./ActivityFeed";
import { BalanceCard } from "./BalanceCard";
import { DashboardPageHeader } from "./DashboardPageHeader";
import { PaymentQrDialog } from "./PaymentQrDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashFocus,
  dashLedger,
} from "./styles";

export function Dashboard() {
  const {
    username,
    usernameResolved,
    openUsernameModal,
    accountUnlocked,
    promptUnlock,
    recoveryMethod,
    zcash,
    syncNow,
  } = useWallet();
  const [origin, setOrigin] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const payLink = username && origin ? `${origin}/pay/${username}` : "";
  const needsUsername = accountUnlocked && usernameResolved && !username;

  return (
    <>
      <DashboardPageHeader
        title={username ? `Hi, @${username}` : `Welcome to ${APP_NAME}`}
        description="Your shielded ZEC balance, payment link and recent activity."
      />

      <InstallApp />

      {needsUsername ? (
        <div className="mb-4 flex flex-col gap-4 rounded-(--dash-radius) border border-(--dash-line-solid) bg-(--dash-surface) p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium">
              Claim your username to start getting paid
            </h2>
            <p className="mt-1 text-sm text-(--dash-ash)">
              It becomes your payment link. Your shielded Zcash address is
              created at the same time.
            </p>
          </div>
          <button
            type="button"
            className={dashButtonPrimary}
            onClick={openUsernameModal}
          >
            Claim username
          </button>
        </div>
      ) : null}

      <div className={`${dashLedger} lg:grid-cols-3`}>
        <section aria-label="Balance" className={`${dashCell} lg:col-span-2`}>
          <BalanceCard
            zcash={zcash}
            locked={!accountUnlocked}
            unlockLabel={unlockLabel(recoveryMethod)}
            onUnlock={promptUnlock}
            onReceive={
              username && zcash.address ? () => setReceiveOpen(true) : undefined
            }
            onSync={() => void syncNow()}
          />
        </section>

        <section aria-label="Payment link" className={dashCell}>
          <PayLinkCard
            payLink={payLink}
            username={username}
            resolved={usernameResolved}
          />
        </section>

        <div className={`${dashCell} lg:col-span-3`}>
          {accountUnlocked ? (
            <ActivityFeed
              history={zcash.history}
              loading={zcash.status === "loading" || zcash.status === "syncing"}
              limit={5}
              showSeeAll
              showFilters={false}
              title="Recent activity"
            />
          ) : (
            <div className="p-6">
              <h2 className="dashboard-tile-title">Recent activity</h2>
              <p className="max-w-sm py-10 text-sm leading-6 text-(--dash-ash)">
                Your payment history is decrypted on this device only. Unlock to
                read it.
              </p>
            </div>
          )}
        </div>
      </div>

      {username && zcash.address ? (
        <ReceiveDialog
          open={receiveOpen}
          onClose={() => setReceiveOpen(false)}
          username={username}
          address={zcash.address}
        />
      ) : null}
    </>
  );
}

function PayLinkCard({
  payLink,
  username,
  resolved,
}: {
  payLink: string;
  username: string | null;
  resolved: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const qrTriggerRef = useRef<HTMLButtonElement>(null);
  const displayLink = payLink.replace(/^https?:\/\//, "");

  async function copyLink() {
    if (!payLink) return;
    await navigator.clipboard?.writeText(payLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="dashboard-tile-title">Payment link</h2>
        {username ? (
          <Link
            href={LINKS_PATH}
            className={`inline-flex items-center gap-0.5 text-sm text-(--dash-ash) transition-colors hover:text-(--dash-fg) ${dashFocus}`}
          >
            Manage
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {username ? (
        <>
          <p className="mt-4 text-sm leading-6 text-(--dash-ash)">
            Anyone can pay you in ZEC from any Zcash wallet. Payments land in
            your shielded balance.
          </p>
          <div className="mt-5 truncate border-y border-(--dash-line) py-3 font-mono text-sm">
            {displayLink || "Loading link…"}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            <Action primary onClick={copyLink} disabled={!payLink}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Action>
            <button
              ref={qrTriggerRef}
              type="button"
              className={dashButtonSecondary}
              onClick={() => setQrOpen(true)}
              disabled={!payLink}
              aria-label="Show QR code"
            >
              <QrCode />
              QR
            </button>
            <a
              href={payLink || undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!payLink}
              className={dashButtonSecondary}
            >
              <ExternalLink aria-hidden="true" />
              Open
            </a>
          </div>
          {payLink ? (
            <PaymentQrDialog
              open={qrOpen}
              onOpenChange={setQrOpen}
              url={payLink}
              triggerRef={qrTriggerRef}
            />
          ) : null}
        </>
      ) : resolved ? (
        <p className="mt-4 text-sm leading-6 text-(--dash-ash)">
          Your link appears here as soon as you claim a username.
        </p>
      ) : (
        <div className="mt-5 h-11 rounded-(--dash-radius-sm) bg-(--dash-tint) motion-safe:animate-pulse" />
      )}
    </div>
  );
}

function Action({
  primary = false,
  onClick,
  disabled,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={primary ? dashButtonPrimary : dashButtonSecondary}
    >
      {children}
    </button>
  );
}
