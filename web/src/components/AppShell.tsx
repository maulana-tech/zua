"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { isProtectedRoute } from "../lib/auth-routes";
import { APP_NAME } from "../lib/brand";
import {
  ensureCrossOriginIsolation,
  needsCrossOriginIsolation,
} from "../lib/isolation";
import { network } from "../lib/zcash/network";
import { AccountTypeDialog } from "./AccountTypeDialog";
import { BackLink } from "./BackLink";
import { DashboardBackground } from "./dashboard/DashboardBackground";
import { DashboardShell } from "./dashboard/DashboardShell";
import { PinDialog } from "./PinDialog";
import { RecoveryDialog } from "./RecoveryDialog";
import { UsernameModal } from "./UsernameModal";
import { StickyBanner } from "./ui/sticky-banner";
import { useWallet } from "./WalletProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const {
    usernameModalOpen,
    closeUsernameModal,
    pinModalOpen,
    pinMode,
    pinSubmitting,
    pinError,
    submitPin,
    closePinModal,
    recoveryModal,
    recoveryBusy,
    recoveryError,
    passkeySupported,
    chooseRecovery,
    unlockWithPasskey,
    closeRecoveryModal,
    accountUnlocked,
    username,
    accountType,
    accountTypeResolved,
    chooseAccountType,
  } = useWallet();
  const pathname = usePathname();
  const isPay = pathname.startsWith("/pay");
  const protectedRoute = isProtectedRoute(pathname);
  const [reloading, setReloading] = useState(false);

  // The wallet needs cross-origin isolation, which a client-side navigation
  // from the login page cannot provide (patch 0012 behaviour).
  useEffect(() => {
    if (!needsCrossOriginIsolation(pathname)) return;
    if (ensureCrossOriginIsolation() === "reloading") setReloading(true);
  }, [pathname]);

  const networkBanner = protectedRoute ? (
    <StickyBanner
      className="z-[80] min-h-10 border-b border-brand-linen/30 bg-brand-obsidian-secondary px-12 py-2 text-center text-sm font-medium text-brand-linen"
      hideOnScroll={false}
    >
      <p role="status" aria-label="Network status">
        {network === "test"
          ? `${APP_NAME} is running on Zcash testnet. Balances are test funds with no real value.`
          : `${APP_NAME} is experimental software on Zcash mainnet. Use small amounts.`}
      </p>
    </StickyBanner>
  ) : null;

  const usernameModal = (
    <UsernameModal open={usernameModalOpen} onClose={closeUsernameModal} />
  );
  const pinModal = (
    <PinDialog
      open={pinModalOpen}
      mode={pinMode}
      submitting={pinSubmitting}
      error={pinError}
      onSubmit={submitPin}
      onClose={closePinModal}
    />
  );
  const recoveryDialog = (
    <RecoveryDialog
      modal={recoveryModal}
      busy={recoveryBusy}
      error={recoveryError}
      passkeySupported={passkeySupported}
      onChoose={(method) => void chooseRecovery(method)}
      onUnlock={() => void unlockWithPasskey()}
      onClose={closeRecoveryModal}
    />
  );

  // Onboarding, after the username: which tools to put first.
  const accountTypeDialog = (
    <AccountTypeDialog
      open={
        accountUnlocked &&
        Boolean(username) &&
        accountTypeResolved &&
        accountType === null &&
        !usernameModalOpen
      }
      onChoose={chooseAccountType}
    />
  );

  if (reloading) {
    return (
      <div className="theme-product contents" data-product-theme="">
        <div className="grid min-h-svh place-items-center bg-background px-6 text-center">
          <p className="text-sm text-ink/70" role="status">
            Preparing the shielded wallet…
          </p>
        </div>
      </div>
    );
  }

  if (pathname === "/" || protectedRoute) {
    if (pathname !== "/") {
      return (
        <div className="theme-product contents" data-product-theme="">
          {networkBanner}
          <div className="block w-full m-0 p-0">{children}</div>
          {usernameModal}
          {pinModal}
          {recoveryDialog}
          {accountTypeDialog}
        </div>
      );
    }

    return (
      <>
        {networkBanner}
        <div className="block w-full m-0 p-0">{children}</div>
        {usernameModal}
        {pinModal}
        {recoveryDialog}
      </>
    );
  }

  // Widgets framed by merchants' sites (public/embed.js): content only.
  if (pathname.startsWith("/embed/")) {
    return (
      <div className="theme-product contents" data-product-theme="">
        <DashboardBackground compact>
          <div
            id="zua-embed-root"
            className="mx-auto grid w-full max-w-xl gap-4 p-3"
          >
            {children}
          </div>
        </DashboardBackground>
      </div>
    );
  }

  // Standalone public pages share one shell: back link, the cat, content.
  if (
    isPay ||
    pathname === "/verify" ||
    pathname === "/claim" ||
    pathname.startsWith("/unsubscribe/")
  ) {
    return (
      <div className="theme-product contents" data-product-theme="">
        <DashboardBackground>
          <DashboardShell contentClassName="flex min-h-svh max-w-3xl flex-col">
            <header className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center">
              <BackLink className="justify-self-start" />
              <Link href="/" aria-label="Zua home">
                <Image
                  src="/assets/zua-white.svg"
                  alt="Zua"
                  width={40}
                  height={40}
                  className="size-16"
                />
              </Link>
            </header>
            <div className="grid flex-1 content-center gap-5 py-8">
              {children}
            </div>
          </DashboardShell>
        </DashboardBackground>
      </div>
    );
  }

  return (
    <div className="theme-product contents" data-product-theme="">
      {children}
    </div>
  );
}
