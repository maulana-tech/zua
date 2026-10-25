"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FilePlus2,
  Inbox,
  Link2,
  QrCode,
  Store,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AccountType } from "../../features/account/accountType";
import { InstallApp } from "../../features/pwa/InstallApp";
import {
  INVOICES_PATH,
  LINKS_PATH,
  POS_PATH,
  REQUESTS_PATH,
  SEND_PATH,
} from "../../lib/auth-routes";
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
    accountType,
    businessName,
  } = useWallet();
  const [origin, setOrigin] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const payLink = username && origin ? `${origin}/pay/${username}` : "";
  const needsUsername = accountUnlocked && usernameResolved && !username;
  const canReceive = Boolean(username && zcash.address);
  const greeting =
    accountType === "business" && businessName
      ? `Hi, ${businessName}`
      : username
        ? `Hi, @${username}`
        : `Welcome to ${APP_NAME}`;

  return (
    <>
      <DashboardPageHeader
        title={greeting}
        description={OVERVIEW_DESCRIPTION[accountType ?? "personal"]}
      />

      <InstallApp />

      {username && accountType ? (
        <QuickActions
          type={accountType}
          onReceive={canReceive ? () => setReceiveOpen(true) : undefined}
        />
      ) : null}

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

const OVERVIEW_DESCRIPTION: Record<AccountType, string> = {
  personal: "Your shielded ZEC balance, payment link and recent activity.",
  freelancer:
    "Your shielded ZEC balance, what clients paid and what is still open.",
  business:
    "Your shielded ZEC balance, today's sales and recent activity, decrypted on this device.",
};

type QuickAction = {
  label: string;
  icon: typeof Store;
  href?: string;
  receive?: true;
};

// The first things each kind of account does, one tap from the overview.
const QUICK_ACTIONS: Record<AccountType, QuickAction[]> = {
  personal: [
    { label: "Receive", icon: ArrowDownLeft, receive: true },
    { label: "Send", icon: ArrowUpRight, href: SEND_PATH },
    { label: "Request", icon: Inbox, href: REQUESTS_PATH },
  ],
  freelancer: [
    { label: "New invoice", icon: FilePlus2, href: `${INVOICES_PATH}?new=1` },
    { label: "Payment link", icon: Link2, href: LINKS_PATH },
    { label: "Receive", icon: ArrowDownLeft, receive: true },
  ],
  business: [
    { label: "New sale", icon: Store, href: POS_PATH },
    { label: "New invoice", icon: FilePlus2, href: `${INVOICES_PATH}?new=1` },
    { label: "Receive", icon: ArrowDownLeft, receive: true },
  ],
};

function QuickActions({
  type,
  onReceive,
}: {
  type: AccountType;
  onReceive?: () => void;
}) {
  return (
    <nav aria-label="Quick actions" className="mb-4 flex flex-wrap gap-2">
      {QUICK_ACTIONS[type].map(({ label, icon: Icon, href, receive }, i) => {
        const className = i === 0 ? dashButtonPrimary : dashButtonSecondary;
        return href ? (
          <Link key={label} href={href} className={className}>
            <Icon aria-hidden="true" />
            {label}
          </Link>
        ) : receive ? (
          <button
            key={label}
            type="button"
            className={className}
            onClick={onReceive}
            disabled={!onReceive}
          >
            <Icon aria-hidden="true" />
            {label}
          </button>
        ) : null;
      })}
    </nav>
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
