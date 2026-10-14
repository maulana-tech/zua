"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  findInvoicePayments,
  findRequestPayments,
} from "../features/invoices/settle";
import { type Receipt, signReceipt } from "../features/receipts/receipt";
import { DASHBOARD_PATH, SIGN_IN_PATH } from "../lib/auth-routes";
import {
  decryptMaster,
  deserializeEscrow,
  encryptMaster,
  randomMaster,
  serializeEscrow,
} from "../lib/keys";
import {
  createPasskeyMaster,
  type PasskeyRecord,
  passkeyErrorMessage,
  passkeysAvailable,
  unlockPasskeyMaster,
} from "../lib/passkey";
import { BadPinError } from "../lib/pin-errors";
import {
  type ProfileClaim,
  signClaim,
  signingPubkeyHex,
} from "../lib/profileClaim";
import {
  messagingPubkeyHex,
  open as openSealed,
  type Sealed,
} from "../lib/sealedBox";
import { lightwalletdUrl, network } from "../lib/zcash/network";
import {
  messagingSecret,
  mnemonicFromMaster,
  profileSigningSeed,
  walletDbKey,
} from "../lib/zcash/seed";
import type { Balances, SyncState, WalletTx } from "../lib/zcash/wallet";
import { loadWalletDb, saveWalletDb } from "../lib/zcash/walletStore";
import { api } from "../trpc/client";
import type { PinMode } from "./PinDialog";

export type RecoveryMethod = "passkey" | "pin";
export type RecoveryModal = "choose" | "passkey-unlock";

export type ZcashStatus = "locked" | "loading" | "syncing" | "ready" | "error";

export type ZcashState = {
  status: ZcashStatus;
  address: string | null;
  balances: Balances | null;
  history: WalletTx[];
  sync: SyncState | null;
  lastSyncedAt: number | null;
  error: string | null;
};

type SendInput = {
  to: string;
  amountZat: bigint;
  memo?: string;
  onStage?: (stage: "proposing" | "proving" | "broadcasting") => void;
};

type WalletState = {
  authenticated: boolean;
  sessionReady: boolean;
  connecting: boolean;
  error: string;
  username: string | null;
  usernameResolved: boolean;
  setUsername: (u: string | null) => void;
  usernameModalOpen: boolean;
  openUsernameModal: () => void;
  closeUsernameModal: () => void;
  /** Creates the Zcash account, signs the profile claim, claims @username. */
  claimUsername: (username: string) => Promise<void>;
  accountUnlocked: boolean;
  pinModalOpen: boolean;
  pinMode: PinMode;
  pinSubmitting: boolean;
  pinError: string;
  submitPin: (pin: string) => Promise<void>;
  closePinModal: () => void;
  promptUnlock: () => void;
  signIn: () => void;
  disconnect: () => Promise<void>;
  recoveryMethod: RecoveryMethod | null;
  recoveryModal: RecoveryModal | null;
  recoveryBusy: boolean;
  recoveryError: string;
  passkeySupported: boolean;
  chooseRecovery: (method: RecoveryMethod) => Promise<void>;
  unlockWithPasskey: () => Promise<void>;
  closeRecoveryModal: () => void;
  zcash: ZcashState;
  syncNow: () => Promise<void>;
  send: (input: SendInput) => Promise<string[]>;
  /** 24-word backup for another Zcash wallet; null while locked. */
  revealMnemonic: () => string | null;
  /** Opens a sealed box addressed to this account; null while locked. */
  openBox: <T>(box: Sealed) => T | null;
  /** This account's messaging public key; null while locked. */
  messagingPubkey: () => string | null;
  /** Signed receipt for a received, mined payment; null while locked. */
  /** Builds a receipt that proves amount and memo on chain; throws on failure. */
  issueReceipt: (tx: WalletTx) => Promise<Receipt>;
};

const EMPTY_ZCASH: ZcashState = {
  status: "locked",
  address: null,
  balances: null,
  history: [],
  sync: null,
  lastSyncedAt: null,
  error: null,
};

const SYNC_INTERVAL_MS = 30_000;
const dbId = (name: string) => `${network}:${name}`;

const WalletContext = createContext<WalletState | null>(null);

type Wallet = import("../lib/zcash/wallet").ZcashWallet;

export function WalletProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Public payment and proof pages must not bootstrap an account or redirect.
  const payerRoute = Boolean(
    pathname?.startsWith("/pay") ||
      pathname?.startsWith("/i/") ||
      pathname?.startsWith("/unsubscribe") ||
      pathname === "/verify",
  );
  const { ready, authenticated, user, login, logout } = usePrivy();
  const userId = user?.id ?? null;

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameResolved, setUsernameResolved] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [accountUnlocked, setAccountUnlocked] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinMode, setPinMode] = useState<PinMode>("unlock");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState("");
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod | null>(
    null,
  );
  const [recoveryModal, setRecoveryModal] = useState<RecoveryModal | null>(
    null,
  );
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [zcash, setZcash] = useState<ZcashState>(EMPTY_ZCASH);

  // Secrets live in refs (page memory) only, and are wiped on disconnect.
  const masterRef = useRef<Uint8Array | null>(null);
  const pendingMasterRef = useRef<Uint8Array | null>(null);
  const passkeyRef = useRef<(PasskeyRecord & { signPubkeyHex: string }) | null>(
    null,
  );
  const walletRef = useRef<Wallet | null>(null);
  const syncingRef = useRef(false);
  const sessionRef = useRef(0);

  useEffect(() => setPasskeySupported(passkeysAvailable()), []);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const routeToDashboard = useCallback(() => {
    if (pathnameRef.current === SIGN_IN_PATH) router.replace(DASHBOARD_PATH);
  }, [router]);

  const openPinModal = useCallback((mode: PinMode) => {
    setPinMode(mode);
    setPinError("");
    setPinModalOpen(true);
  }, []);

  const openRecoveryModal = useCallback((modal: RecoveryModal) => {
    setRecoveryError("");
    setRecoveryModal(modal);
  }, []);

  // ---- Zcash wallet ------------------------------------------------------

  const settleInvoices = useCallback(async (history: WalletTx[]) => {
    if (!history.some((tx) => tx.kind === "received")) return;
    const invoices = await api.invoices.list.query();
    for (const payment of findInvoicePayments(history, invoices)) {
      await api.invoices.reportPayment.mutate({
        id: payment.id,
        txids: payment.txids,
        paidZat: payment.paidZat.toString(),
      });
    }
    const outgoing = await api.requests.list.query({ direction: "outgoing" });
    const pending = new Set(
      outgoing.filter((r) => r.status === "pending").map((r) => r.id),
    );
    for (const paid of findRequestPayments(history, pending))
      await api.requests.markPaid.mutate(paid);
  }, []);

  const runSync = useCallback(
    async (name: string) => {
      const wallet = walletRef.current;
      const master = masterRef.current;
      if (!wallet || !master || syncingRef.current) return;
      const session = sessionRef.current;
      syncingRef.current = true;
      setZcash((z) => ({ ...z, status: "syncing", error: null }));
      try {
        await wallet.sync();
        const [{ sync, balances }, history] = await Promise.all([
          wallet.status(),
          wallet.history(),
        ]);
        if (session !== sessionRef.current) return;
        setZcash((z) => ({
          ...z,
          status: "ready",
          balances,
          history,
          sync,
          lastSyncedAt: Date.now(),
        }));
        await saveWalletDb(
          dbId(name),
          await wallet.export(),
          walletDbKey(master),
        );
        void settleInvoices(history).catch(() => {});
      } catch (cause) {
        if (session !== sessionRef.current) return;
        setZcash((z) => ({
          ...z,
          status: "error",
          error: cause instanceof Error ? cause.message : "Wallet sync failed.",
        }));
      } finally {
        syncingRef.current = false;
      }
    },
    [settleInvoices],
  );

  /** Opens (or creates) the wallet for an unlocked master and profile. */
  const openWallet = useCallback(
    async (name: string, birthday: number, expectedUa: string | null) => {
      const master = masterRef.current;
      if (!master) throw new Error("Unlock your account first.");
      const session = sessionRef.current;
      setZcash((z) => ({ ...z, status: "loading", error: null }));
      const { ZcashWallet } = await import("../lib/zcash/wallet");
      const cached = await loadWalletDb(dbId(name), walletDbKey(master));
      const wallet = await ZcashWallet.open({
        mnemonic: mnemonicFromMaster(master),
        birthday,
        db: cached,
      });
      // Key correctness is already checked at unlock (passkey signing key or
      // PIN escrow decryption); the published address is what we show.
      walletRef.current?.close();
      walletRef.current = wallet;
      const address = expectedUa ?? (await wallet.address());
      if (session !== sessionRef.current) return;
      setZcash((z) => ({ ...z, address }));
      void runSync(name);
    },
    [runSync],
  );

  // Periodic sync while unlocked and the tab is visible.
  useEffect(() => {
    if (!accountUnlocked || !username) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void runSync(username);
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [accountUnlocked, username, runSync]);

  // ---- Session -----------------------------------------------------------

  const afterUnlock = useCallback(
    async (name: string | null) => {
      setAccountUnlocked(true);
      if (!name) {
        setUsernameModalOpen(true);
        return;
      }
      const profile = await api.profiles.me.query();
      if (!profile) return;
      await openWallet(profile.username, profile.birthday, profile.ua);
    },
    [openWallet],
  );

  useEffect(() => {
    if (!ready) return;
    const session = ++sessionRef.current;
    if (!authenticated || !userId) {
      setUsername(null);
      setUsernameResolved(false);
      setAccountUnlocked(false);
      setZcash(EMPTY_ZCASH);
      setSessionReady(true);
      return;
    }
    if (payerRoute) {
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    setConnecting(true);
    setSessionReady(false);
    setError("");
    api.accounts.me
      .query()
      .then((me) => {
        if (cancelled || session !== sessionRef.current) return;
        setUsername(me.username);
        setUsernameResolved(true);
        setRecoveryMethod(me.recovery);
        passkeyRef.current = me.passkey;
        if (masterRef.current) return; // already unlocked this page
        if (me.recovery === "passkey") openRecoveryModal("passkey-unlock");
        else if (me.recovery === "pin") openPinModal("unlock");
        else if (passkeysAvailable()) openRecoveryModal("choose");
        else {
          pendingMasterRef.current = randomMaster();
          openPinModal("set");
        }
        routeToDashboard();
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "Could not load account.",
          );
      })
      .finally(() => {
        if (!cancelled) {
          setConnecting(false);
          setSessionReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    authenticated,
    userId,
    payerRoute,
    openPinModal,
    openRecoveryModal,
    routeToDashboard,
  ]);

  const chooseRecovery = useCallback(
    async (method: RecoveryMethod) => {
      setRecoveryError("");
      if (method === "pin") {
        pendingMasterRef.current = randomMaster();
        setRecoveryModal(null);
        openPinModal("set");
        return;
      }
      setRecoveryBusy(true);
      try {
        const { master, record } = await createPasskeyMaster({
          userName: user?.email?.address ?? user?.google?.email ?? "account",
        });
        const signPubkeyHex = signingPubkeyHex(profileSigningSeed(master));
        await api.accounts.savePasskey.mutate({ ...record, signPubkeyHex });
        passkeyRef.current = { ...record, signPubkeyHex };
        masterRef.current = master;
        setRecoveryMethod("passkey");
        setRecoveryModal(null);
        await afterUnlock(username);
      } catch (cause) {
        setRecoveryError(passkeyErrorMessage(cause));
      } finally {
        setRecoveryBusy(false);
      }
    },
    [user, username, openPinModal, afterUnlock],
  );

  const unlockWithPasskey = useCallback(async () => {
    const record = passkeyRef.current;
    if (!record) return;
    setRecoveryBusy(true);
    setRecoveryError("");
    try {
      const master = await unlockPasskeyMaster({ record });
      if (
        signingPubkeyHex(profileSigningSeed(master)) !== record.signPubkeyHex
      ) {
        master.fill(0);
        throw new Error(
          "This passkey derived different keys than your account uses. Choose the passkey you created for this account.",
        );
      }
      masterRef.current = master;
      setRecoveryModal(null);
      await afterUnlock(username);
    } catch (cause) {
      setRecoveryError(passkeyErrorMessage(cause));
    } finally {
      setRecoveryBusy(false);
    }
  }, [username, afterUnlock]);

  const submitPin = useCallback(
    async (pin: string) => {
      setPinSubmitting(true);
      setPinError("");
      try {
        if (pinMode === "set" || pinMode === "secure") {
          const master = pendingMasterRef.current ?? randomMaster();
          await api.accounts.saveEscrow.mutate(
            serializeEscrow(encryptMaster(master, pin)),
          );
          pendingMasterRef.current = null;
          masterRef.current = master;
          setRecoveryMethod("pin");
        } else {
          const escrow = await api.accounts.getEscrow.query();
          if (!escrow) {
            openPinModal("set");
            return;
          }
          try {
            masterRef.current = decryptMaster(deserializeEscrow(escrow), pin);
          } catch {
            throw new BadPinError();
          }
        }
        setPinModalOpen(false);
        await afterUnlock(username);
      } catch (cause) {
        setPinError(
          cause instanceof BadPinError
            ? "Incorrect PIN. Try again."
            : cause instanceof Error
              ? cause.message
              : "Something went wrong.",
        );
      } finally {
        setPinSubmitting(false);
      }
    },
    [pinMode, username, openPinModal, afterUnlock],
  );

  const claimUsername = useCallback(
    async (name: string) => {
      const master = masterRef.current;
      if (!master) throw new Error("Unlock your account first.");
      const { ZcashWallet } = await import("../lib/zcash/wallet");
      // Birthday a little before the tip, so sync starts near "now".
      const birthday = Math.max(0, (await ZcashWallet.latestBlock()) - 100);
      const wallet = await ZcashWallet.open({
        mnemonic: mnemonicFromMaster(master),
        birthday,
      });
      const ua = await wallet.address();
      const seed = profileSigningSeed(master);
      const claim: ProfileClaim = {
        v: 1,
        username: name,
        network,
        ua,
        birthday,
        signPubkeyHex: signingPubkeyHex(seed),
        msgPubkeyHex: messagingPubkeyHex(messagingSecret(master)),
        issuedAt: new Date().toISOString(),
      };
      const { canonicalClaim } = await import("../lib/profileClaim");
      await api.profiles.create.mutate({
        claimJson: canonicalClaim(claim),
        claimSigHex: signClaim(claim, seed),
      });
      walletRef.current?.close();
      walletRef.current = wallet;
      setUsername(name);
      setUsernameModalOpen(false);
      setZcash((z) => ({ ...z, address: ua }));
      void runSync(name);
    },
    [runSync],
  );

  const syncNow = useCallback(async () => {
    if (username) await runSync(username);
  }, [username, runSync]);

  const send = useCallback(
    async (input: SendInput) => {
      const wallet = walletRef.current;
      const master = masterRef.current;
      if (!wallet || !master) throw new Error("Unlock your account first.");
      const txids = await wallet.send({
        ...input,
        mnemonic: mnemonicFromMaster(master),
      });
      if (username) void runSync(username);
      return txids;
    },
    [username, runSync],
  );

  const revealMnemonic = useCallback(
    () => (masterRef.current ? mnemonicFromMaster(masterRef.current) : null),
    [],
  );

  const openBox = useCallback(<T,>(box: Sealed): T | null => {
    if (!masterRef.current) return null;
    try {
      return openSealed<T>(box, messagingSecret(masterRef.current));
    } catch {
      return null;
    }
  }, []);

  const messagingPubkey = useCallback(
    () =>
      masterRef.current
        ? messagingPubkeyHex(messagingSecret(masterRef.current))
        : null,
    [],
  );

  const issueReceipt = useCallback(
    async (tx: WalletTx): Promise<Receipt> => {
      const master = masterRef.current;
      if (!master || !username || !zcash.address)
        throw new Error("Unlock your account first.");
      const { rawTransaction } = await import("../lib/zcash/lightwalletd");
      const { discloseOutputs } = await import("../lib/zcash/wallet");
      const raw = await rawTransaction(lightwalletdUrl, tx.txid);
      if (!raw) throw new Error("This payment isn't mined yet.");
      const received = (
        await discloseOutputs({
          mnemonic: mnemonicFromMaster(master),
          tx: raw.data,
          height: raw.height,
        })
      ).filter((d) => !d.internal);
      if (!received.length)
        throw new Error(
          "No Orchard output in this transaction pays you. Receipts cover Orchard payments only.",
        );
      return signReceipt(
        {
          v: 2,
          network,
          txid: tx.txid,
          height: raw.height,
          amountZat: received.reduce((sum, d) => sum + d.value, 0n).toString(),
          memo: received
            .map((d) => d.memo)
            .filter(Boolean)
            .join("\n"),
          recipient: { username, ua: zcash.address },
          disclosures: received.map(({ action, kEnc }) => ({ action, kEnc })),
          issuedAt: new Date().toISOString(),
        },
        profileSigningSeed(master),
      );
    },
    [username, zcash.address],
  );

  const closeRecoveryModal = useCallback(() => {
    // Choosing a method is mandatory for a new account; unlocking can wait.
    setRecoveryModal((current) => (current === "choose" ? current : null));
  }, []);

  const signIn = useCallback(() => {
    if (!authenticated) login();
  }, [authenticated, login]);

  const disconnect = useCallback(async () => {
    sessionRef.current += 1;
    masterRef.current?.fill(0);
    masterRef.current = null;
    pendingMasterRef.current?.fill(0);
    pendingMasterRef.current = null;
    passkeyRef.current = null;
    walletRef.current?.close();
    walletRef.current = null;
    setZcash(EMPTY_ZCASH);
    setRecoveryModal(null);
    setRecoveryMethod(null);
    setUsername(null);
    setUsernameModalOpen(false);
    setPinModalOpen(false);
    setAccountUnlocked(false);
    await logout();
  }, [logout]);

  const openUsernameModal = useCallback(() => setUsernameModalOpen(true), []);
  const closeUsernameModal = useCallback(() => setUsernameModalOpen(false), []);
  const closePinModal = useCallback(() => {
    if (pinMode !== "set") setPinModalOpen(false);
  }, [pinMode]);
  const promptUnlock = useCallback(() => {
    if (passkeyRef.current) openRecoveryModal("passkey-unlock");
    else openPinModal("unlock");
  }, [openPinModal, openRecoveryModal]);

  const value = useMemo<WalletState>(
    () => ({
      authenticated,
      sessionReady,
      connecting,
      error,
      username,
      usernameResolved,
      setUsername,
      usernameModalOpen,
      openUsernameModal,
      closeUsernameModal,
      claimUsername,
      accountUnlocked,
      pinModalOpen,
      pinMode,
      pinSubmitting,
      pinError,
      submitPin,
      closePinModal,
      promptUnlock,
      signIn,
      disconnect,
      recoveryMethod,
      recoveryModal,
      recoveryBusy,
      recoveryError,
      passkeySupported,
      chooseRecovery,
      unlockWithPasskey,
      closeRecoveryModal,
      zcash,
      syncNow,
      send,
      revealMnemonic,
      openBox,
      messagingPubkey,
      issueReceipt,
    }),
    [
      authenticated,
      sessionReady,
      connecting,
      error,
      username,
      usernameResolved,
      usernameModalOpen,
      openUsernameModal,
      closeUsernameModal,
      claimUsername,
      accountUnlocked,
      pinModalOpen,
      pinMode,
      pinSubmitting,
      pinError,
      submitPin,
      closePinModal,
      promptUnlock,
      signIn,
      disconnect,
      recoveryMethod,
      recoveryModal,
      recoveryBusy,
      recoveryError,
      passkeySupported,
      chooseRecovery,
      unlockWithPasskey,
      closeRecoveryModal,
      zcash,
      syncNow,
      send,
      revealMnemonic,
      openBox,
      messagingPubkey,
      issueReceipt,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useOptionalWallet(): WalletState | null {
  return useContext(WalletContext);
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}
