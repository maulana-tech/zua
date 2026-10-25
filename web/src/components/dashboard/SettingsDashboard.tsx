"use client";

import { ChevronRight, Loader, LockKeyhole, LogOut } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ACCOUNT_TYPES,
  type AccountType,
  hiddenFor,
} from "../../features/account/accountType";
import { EmailNotificationsRow } from "../../features/notifications/EmailNotificationsRow";
import { useChangeRecoveryPin } from "../../features/recovery/hooks/useChangeRecoveryPin";
import { PaymentAlertsRow } from "../../features/zcash/PaymentAlertsRow";
import { trpc } from "../../trpc/react";
import { ACCOUNT_TYPE_ICONS } from "../AccountTypeDialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";
import { ChangeRecoveryPinDialog } from "./ChangeRecoveryPinDialog";
import { DashboardPageHeader } from "./DashboardPageHeader";
import { NAV_ITEMS } from "./navItems";
import { dashButtonPrimary, dashCell, dashFocus, dashLedger } from "./styles";
import { WebsiteWidgetTile } from "./WebsiteWidgetTile";
import { ZcashWalletTile } from "./ZcashWalletTile";

export function SettingsDashboard() {
  const { username, disconnect, recoveryMethod, openUsernameModal } =
    useWallet();
  const [changePinOpen, setChangePinOpen] = useState(false);
  const { changeRecoveryPin, validateCurrentPin, isChanging } =
    useChangeRecoveryPin();
  const escrowQuery = trpc.accounts.getEscrow.useQuery();
  const passkeyProtected = recoveryMethod === "passkey";

  return (
    <>
      <DashboardPageHeader
        title="Settings"
        description="Your account, your Zcash wallet and how it is protected."
      />

      <div className={`${dashLedger} max-w-3xl`}>
        <IdentityTile username={username} onClaim={openUsernameModal} />
        <AccountTypeTile />
        <ZcashWalletTile />
        {username ? <WebsiteWidgetTile username={username} /> : null}
        <PaymentAlertsRow />
        <EmailNotificationsRow />
        <RecoveryTile
          method={passkeyProtected ? "passkey" : "pin"}
          protectedRecovery={passkeyProtected || Boolean(escrowQuery.data)}
          loading={escrowQuery.isLoading}
          onChangePin={() => setChangePinOpen(true)}
        />
        <SessionTile onSignOut={disconnect} />
      </div>

      <ChangeRecoveryPinDialog
        open={changePinOpen}
        onOpenChange={setChangePinOpen}
        onSubmit={changeRecoveryPin}
        onValidateCurrentPin={validateCurrentPin}
        isChanging={isChanging}
        onSuccess={() => {
          void escrowQuery.refetch();
          toast.success("Recovery PIN changed");
        }}
      />
    </>
  );
}

function SettingsRow({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`${dashCell} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="dashboard-tile-title">{title}</h2>
        {aside}
      </div>
      <div className="mt-3 max-w-xl text-sm leading-6 text-(--dash-ash)">
        {description}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function IdentityTile({
  username,
  onClaim,
}: {
  username: string | null;
  onClaim: () => void;
}) {
  return (
    <SettingsRow
      title="Account handle"
      description="The public name people use to pay you. It does not reveal your balance or payment history."
    >
      {username ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-(--dash-radius-sm) border border-(--dash-line) px-3 py-1.5 font-mono text-sm">
            @{username}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-brand-linen/50">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            Permanent, cannot be renamed
          </span>
        </div>
      ) : (
        <button type="button" className={dashButtonPrimary} onClick={onClaim}>
          Claim username
        </button>
      )}
    </SettingsRow>
  );
}

function AccountTypeTile() {
  const { accountType, businessName, chooseAccountType } = useWallet();
  const [selected, setSelected] = useState<AccountType | null>(accountType);
  const [name, setName] = useState(businessName ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(accountType), [accountType]);
  useEffect(() => setName(businessName ?? ""), [businessName]);

  const dirty =
    selected !== accountType ||
    (selected === "business" && name.trim() !== (businessName ?? ""));
  const otherTools = hiddenFor(accountType, NAV_ITEMS);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await chooseAccountType(
        selected,
        selected === "business" ? name.trim() || null : null,
      );
      toast.success("Account type saved");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Couldn't save the change.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsRow
      title="Account type"
      description="Decides which tools come first in your navigation. Nothing is turned off: every tool stays one click away."
    >
      <div className="grid gap-2" role="radiogroup" aria-label="Account type">
        {ACCOUNT_TYPES.map(({ type, label, tools }) => {
          const Icon = ACCOUNT_TYPE_ICONS[type];
          const checked = selected === type;
          return (
            // biome-ignore lint/a11y/useSemanticElements: row-sized radio
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={saving}
              onClick={() => setSelected(type)}
              className={`flex items-center gap-3 rounded-(--dash-radius-sm) border px-4 py-3 text-left transition-colors ${dashFocus} ${
                checked
                  ? "border-(--dash-fg)"
                  : "border-(--dash-line) hover:border-(--dash-line-strong)"
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-(--dash-fg)">
                  {label}
                </span>
                <span className="block text-xs text-(--dash-ash)">{tools}</span>
              </span>
              <span
                className={`size-2.5 shrink-0 rounded-full ${
                  checked ? "bg-(--dash-accent)" : "bg-(--dash-line)"
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {selected === "business" ? (
        <div className="mt-4 grid max-w-sm gap-2">
          <label className="text-sm font-medium" htmlFor="settings-business">
            Business name{" "}
            <span className="font-normal text-(--dash-ash)">(optional)</span>
          </label>
          <Input
            appearance="linen"
            id="settings-business"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kopi Senja"
          />
        </div>
      ) : null}

      {dirty ? (
        <button
          type="button"
          className={`${dashButtonPrimary} mt-4`}
          onClick={() => void save()}
          disabled={saving || !selected}
          aria-busy={saving}
        >
          {saving ? (
            <Loader className="animate-spin" aria-hidden="true" />
          ) : null}
          {saving ? "Saving…" : "Save"}
        </button>
      ) : null}

      {otherTools.length ? (
        <div className="mt-6">
          <h3 className="text-xs font-semibold tracking-[0.12em] text-(--dash-ash) uppercase">
            Other tools
          </h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {otherTools.map(({ href, label, description, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-(--dash-radius-sm) px-3 py-2.5 transition-colors hover:bg-(--dash-tint) ${dashFocus}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-(--dash-fg)">
                      {label}
                    </span>
                    <span className="block text-xs text-(--dash-ash)">
                      {description}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-(--dash-ash)"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SettingsRow>
  );
}

function RecoveryTile({
  method,
  protectedRecovery,
  loading,
  onChangePin,
}: {
  method: "passkey" | "pin";
  protectedRecovery: boolean;
  loading: boolean;
  onChangePin: () => void;
}) {
  return (
    <SettingsRow
      title={method === "passkey" ? "Recovery passkey" : "Recovery PIN"}
      aside={
        loading ? (
          <Badge appearance="glass" className="gap-1.5">
            <Loader className="size-3 animate-spin" aria-hidden="true" />
            Checking
          </Badge>
        ) : protectedRecovery ? (
          <Badge className="gap-1.5 border border-(--dash-line) bg-transparent text-(--dash-fg)">
            <span
              className="size-1.5 rounded-full bg-(--dash-accent)"
              aria-hidden="true"
            />
            Ready
          </Badge>
        ) : (
          <Badge variant="destructive" className="bg-red-300/15 text-red-100">
            Needs attention
          </Badge>
        )
      }
      description={
        <>
          <p className="font-medium text-(--dash-fg)">
            {loading
              ? "Checking your recovery setup…"
              : method === "passkey"
                ? "Protected by your passkey"
                : protectedRecovery
                  ? "Protected by your recovery PIN"
                  : "Set up your recovery PIN"}
          </p>
          <p>
            {method === "passkey"
              ? "Your private keys are derived from your passkey on each device. Use the same synced passkey anywhere — we store nothing secret."
              : protectedRecovery
                ? "Your PIN lets you restore access on another device. We never see or store the PIN itself."
                : "Without a recovery PIN, moving to a new device could leave you unable to access your funds."}
          </p>
        </>
      }
    >
      {method === "pin" && protectedRecovery && !loading ? (
        <Button variant="glass" onClick={onChangePin}>
          Change PIN
        </Button>
      ) : null}
    </SettingsRow>
  );
}

function SessionTile({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function confirmSignOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
      setSignOutOpen(false);
    }
  }

  return (
    <>
      <SettingsRow
        title="Your session"
        description="Signing out removes access from this device. It does not delete your account, payment history, or funds."
      >
        <Button variant="glass" onClick={() => setSignOutOpen(true)}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out on this device
        </Button>
      </SettingsRow>

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent appearance="linen" size="sm">
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              This removes access from this device. Your account and funds stay
              safe, and you can return with your passkey or recovery PIN.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={signingOut} />}
            >
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmSignOut}
              disabled={signingOut}
              aria-busy={signingOut}
            >
              {signingOut ? (
                <Loader className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="size-4" aria-hidden="true" />
              )}
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
