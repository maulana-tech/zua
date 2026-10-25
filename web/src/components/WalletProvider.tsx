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
import type { AccountType } from "../features/account/accountType";
import {
  findInvoicePayments,
  findRequestPayments,
} from "../features/invoices/settle";
import { itemsFromDisclosures, utcDay } from "../features/receipts/build";
import {
  type Receipt,
  signReceipt,
  sumZat,
} from "../features/receipts/receipt";
import { announcePayments, newIncoming } from "../features/zcash/paymentAlerts";
import { type SignedAddress, signAddressClaim } from "../lib/addressClaim";
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
import { loadRecord, saveRecord } from "../lib/vault";
import { lightwalletdUrl, network } from "../lib/zcash/network";
import {
  claimLinkKey,
  localVaultKey,
  messagingSecret,
  mnemonicFromMaster,
  profileSigningSeed,
  walletDbKey,
} from "../lib/zcash/seed";
import type {
  Balances,
  Payment,
  Proposed,
  SendStage,
  SyncState,
  WalletTx,
} from "../lib/zcash/wallet";
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
  /** Personal, freelancer or business; null until chosen at onboarding. */
  accountType: AccountType | null;
  businessName: string | null;
  accountTypeResolved: boolean;
  chooseAccountType: (
    type: AccountType,
    businessName?: string | null,
  ) => Promise<void>;
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
  /**
   * Syncs every few seconds until the returned function is called, for
   * screens waiting on a payment (point of sale).
   */
  watchPayments: () => () => void;
  /** Device-only encrypted record (lib/vault); null when missing. */
  loadLocal: <T>(name: string) => Promise<T | null>;
  saveLocal: (name: string, value: unknown) => Promise<void>;
  send: (input: SendInput) => Promise<string[]>;
  /** Key of this account's claim link `index`; throws while locked. */
  claimKey: (index: number) => Uint8Array;
  /** A new unlinkable address, signed by this profile, for one invoice/link. */
  freshPayAddress: () => Promise<SignedAddress>;
  /** Builds one transaction paying all rows; review fee, then `proveProposal`. */
  proposePayments: (payments: Payment[]) => Promise<Proposed>;
  /** Proves, signs and broadcasts a proposal from `proposePayments`. */
  proveProposal: (
    proposed: Proposed,
    onStage?: (stage: SendStage) => void,
  ) => Promise<string[]>;
  /** 24-word backup for another Zcash wallet; null while locked. */
  revealMnemonic: () => string | null;
  /** Opens a sealed box addressed to this account; null while locked. */
  openBox: <T>(box: Sealed) => T | null;
  /** This account's messaging public key; null while locked. */
  messagingPubkey: () => string | null;
  /**
   * Receipt that proves a mined payment's amount and memo on chain: "received"
   * for incoming, a payer's proof ("sent") for outgoing. Throws on failure.
   */
  issueReceipt: (tx: WalletTx) => Promise<Receipt>;
  /** Signed statement of every payment received from `from` to `to` (UTC days). */
  issueStatement: (
    from: string,
    to: string,
    onProgress?: (done: number, total: number) => void,
  ) => Promise<Receipt>;
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
// While a screen waits on a payment, and in a background tab (where the
// browser throttles timers anyway).
const WATCH_SYNC_MS = 8_000;
const HIDDEN_SYNC_MS = 120_000;
const SYNC_TICK_MS = 4_000;
const SEEN_LIMIT = 1000;
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
      pathname?.startsWith("/claim") ||
      pathname?.startsWith("/embed/") ||
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
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [accountTypeResolved, setAccountTypeResolved] = useState(false);
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
  const lastSyncRef = useRef(0);
  const watchersRef = useRef(0);
  // Txids already announced (persisted in the vault); null until loaded.
  const seenRef = useRef<Set<string> | null>(null);

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
    // Only the paid total is reported, never txids: the server must not be
    // able to tie an invoice (and its client) to a transaction on chain.
    const invoices = await api.invoices.list.query();
    for (const payment of findInvoicePayments(history, invoices)) {
      await api.invoices.reportPayment.mutate({
        id: payment.id,
        paidZat: payment.paidZat.toString(),
      });
    }
    const outgoing = await api.requests.list.query({ direction: "outgoing" });
    const pending = new Set(
      outgoing.filter((r) => r.status === "pending").map((r) => r.id),
    );
    for (const paid of findRequestPayments(history, pending))
      await api.requests.markPaid.mutate({ id: paid.id });
  }, []);

  /**
   * Merchant API checkouts get their own address from a pool this wallet
   * signs ahead (the server can't derive addresses). Refill it after syncs.
   */
  const topUpAddressPool = useCallback(async (name: string) => {
    const wallet = walletRef.current;
    const master = masterRef.current;
    if (!wallet || !master) return;
    const pool = await api.developer.poolStatus.query();
    const missing = pool.usesApi ? pool.target - pool.unused : 0;
    if (missing <= 0) return;
    const seed = profileSigningSeed(master);
    const addresses = [];
    for (let i = 0; i < missing; i++)
      addresses.push(
        signAddressClaim(
          {
            v: 1,
            username: name,
            network,
            ua: await wallet.nextAddress(),
            issuedAt: new Date().toISOString(),
          },
          seed,
        ),
      );
    await saveWalletDb(dbId(name), await wallet.export(), walletDbKey(master));
    await api.developer.addPoolAddresses.mutate({ addresses });
  }, []);

  /**
   * Toasts payments that are new since the last sync. On the first sync of a
   * visit it summarises what arrived while away; on a new device it starts
   * from what is already there instead of announcing all of history.
   */
  const announceNew = useCallback(async (name: string, history: WalletTx[]) => {
    const master = masterRef.current;
    if (!master) return;
    const key = localVaultKey(master);
    const id = dbId(`${name}:seen`);
    let seen = seenRef.current;
    let whileAway = false;
    if (!seen) {
      const stored = await loadRecord<string[]>(id, key);
      seen = new Set(stored ?? history.map((tx) => tx.txid));
      whileAway = stored !== null;
    }
    const fresh = newIncoming(history, seen);
    for (const tx of history) seen.add(tx.txid);
    seenRef.current = seen;
    announcePayments(fresh, { whileAway });
    await saveRecord(id, [...seen].slice(-SEEN_LIMIT), key);
  }, []);

  const runSync = useCallback(
    async (name: string) => {
      const wallet = walletRef.current;
      const master = masterRef.current;
      if (!wallet || !master || syncingRef.current) return;
      const session = sessionRef.current;
      syncingRef.current = true;
      lastSyncRef.current = Date.now();
      setZcash((z) => ({ ...z, status: "syncing", error: null }));
      try {
        await wallet.sync();
        const [{ sync, balances }, history] = await Promise.all([
          wallet.status(),
          wallet.history(1000),
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
        void announceNew(name, history).catch(() => {});
        void settleInvoices(history).catch(() => {});
        void topUpAddressPool(name).catch(() => {});
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
    [announceNew, settleInvoices, topUpAddressPool],
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

  // Periodic sync while unlocked: every 30 s in view, every few seconds while
  // a screen waits on a payment, and every 2 min in a background tab.
  useEffect(() => {
    if (!accountUnlocked || !username) return;
    const id = window.setInterval(() => {
      const every =
        watchersRef.current > 0
          ? WATCH_SYNC_MS
          : document.visibilityState === "visible"
            ? SYNC_INTERVAL_MS
            : HIDDEN_SYNC_MS;
      if (Date.now() - lastSyncRef.current >= every) void runSync(username);
    }, SYNC_TICK_MS);
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
      setAccountType(null);
      setBusinessName(null);
      setAccountTypeResolved(false);
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
        setAccountType(me.accountType);
        setBusinessName(me.businessName);
        setAccountTypeResolved(true);
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

  const chooseAccountType = useCallback(
    async (type: AccountType, name: string | null = null) => {
      const saved = await api.accounts.setAccountType.mutate({
        accountType: type,
        businessName: name?.trim() || null,
      });
      setAccountType(saved.accountType);
      setBusinessName(saved.businessName);
    },
    [],
  );

  const syncNow = useCallback(async () => {
    if (username) await runSync(username);
  }, [username, runSync]);

  const watchPayments = useCallback(() => {
    watchersRef.current += 1;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      watchersRef.current -= 1;
    };
  }, []);

  const loadLocal = useCallback(
    async <T,>(name: string): Promise<T | null> => {
      const master = masterRef.current;
      if (!master || !username) return null;
      return loadRecord<T>(dbId(`${username}:${name}`), localVaultKey(master));
    },
    [username],
  );

  const saveLocal = useCallback(
    async (name: string, value: unknown) => {
      const master = masterRef.current;
      if (!master || !username) throw new Error("Unlock your account first.");
      await saveRecord(
        dbId(`${username}:${name}`),
        value,
        localVaultKey(master),
      );
    },
    [username],
  );

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

  const persistWallet = useCallback(async () => {
    const wallet = walletRef.current;
    const master = masterRef.current;
    if (wallet && master && username)
      await saveWalletDb(
        dbId(username),
        await wallet.export(),
        walletDbKey(master),
      );
  }, [username]);

  const claimKey = useCallback((index: number) => {
    if (!masterRef.current) throw new Error("Unlock your account first.");
    return claimLinkKey(masterRef.current, index);
  }, []);

  const freshPayAddress = useCallback(async (): Promise<SignedAddress> => {
    const wallet = walletRef.current;
    const master = masterRef.current;
    if (!wallet || !master || !username)
      throw new Error("Unlock your account first.");
    const ua = await wallet.nextAddress();
    // Save now so a reload can't hand the same diversifier out again.
    await persistWallet();
    return signAddressClaim(
      { v: 1, username, network, ua, issuedAt: new Date().toISOString() },
      profileSigningSeed(master),
    );
  }, [username, persistWallet]);

  const proposePayments = useCallback(async (payments: Payment[]) => {
    const wallet = walletRef.current;
    if (!wallet || !masterRef.current)
      throw new Error("Unlock your account first.");
    return wallet.proposePayments(payments);
  }, []);

  const proveProposal = useCallback(
    async (proposed: Proposed, onStage?: (stage: SendStage) => void) => {
      const wallet = walletRef.current;
      const master = masterRef.current;
      if (!wallet || !master) throw new Error("Unlock your account first.");
      const txids = await wallet.prove(
        proposed.proposal,
        mnemonicFromMaster(master),
        onStage,
      );
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

  /** Receipt items for one mined transaction, from this wallet's keys. */
  const receiptItems = useCallback(
    async (txid: string, direction: "received" | "sent") => {
      const master = masterRef.current;
      if (!master) throw new Error("Unlock your account first.");
      const { rawTransaction } = await import("../lib/zcash/lightwalletd");
      const { discloseOutputs } = await import("../lib/zcash/wallet");
      const raw = await rawTransaction(lightwalletdUrl, txid);
      if (!raw) throw new Error("This payment isn't mined yet.");
      const disclosures = await discloseOutputs({
        mnemonic: mnemonicFromMaster(master),
        tx: raw.data,
        height: raw.height,
      });
      return itemsFromDisclosures(txid, raw.height, disclosures, direction);
    },
    [],
  );

  const issueReceipt = useCallback(
    async (tx: WalletTx): Promise<Receipt> => {
      const master = masterRef.current;
      if (!master || !username) throw new Error("Unlock your account first.");
      const kind = tx.kind === "sent" ? "sent" : "received";
      const items = await receiptItems(tx.txid, kind);
      if (!items.length)
        throw new Error(
          kind === "sent"
            ? "This transaction has no shielded payment to someone else."
            : "No shielded (Orchard or Ironwood) output in this transaction pays you.",
        );
      return signReceipt(
        {
          v: 3,
          kind,
          network,
          signer: username,
          period: null,
          items,
          totalZat: sumZat(items),
          issuedAt: new Date().toISOString(),
        },
        profileSigningSeed(master),
      );
    },
    [username, receiptItems],
  );

  const issueStatement = useCallback(
    async (
      from: string,
      to: string,
      onProgress?: (done: number, total: number) => void,
    ): Promise<Receipt> => {
      const master = masterRef.current;
      if (!master || !username) throw new Error("Unlock your account first.");
      const txs = zcash.history.filter(
        (tx) =>
          tx.kind === "received" &&
          tx.height !== null &&
          tx.timestamp !== null &&
          utcDay(tx.timestamp) >= from &&
          utcDay(tx.timestamp) <= to,
      );
      if (!txs.length)
        throw new Error("No received payments were mined in this period.");
      const items = [];
      for (const [i, tx] of txs.entries()) {
        onProgress?.(i, txs.length);
        items.push(...(await receiptItems(tx.txid, "received")));
      }
      onProgress?.(txs.length, txs.length);
      if (!items.length)
        throw new Error("No shielded payments to you in this period.");
      return signReceipt(
        {
          v: 3,
          kind: "statement",
          network,
          signer: username,
          period: { from, to },
          items,
          totalZat: sumZat(items),
          issuedAt: new Date().toISOString(),
        },
        profileSigningSeed(master),
      );
    },
    [username, zcash.history, receiptItems],
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
    seenRef.current = null;
    setZcash(EMPTY_ZCASH);
    setRecoveryModal(null);
    setRecoveryMethod(null);
    setUsername(null);
    setAccountType(null);
    setBusinessName(null);
    setAccountTypeResolved(false);
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
      accountType,
      businessName,
      accountTypeResolved,
      chooseAccountType,
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
      watchPayments,
      loadLocal,
      saveLocal,
      send,
      claimKey,
      freshPayAddress,
      proposePayments,
      proveProposal,
      revealMnemonic,
      openBox,
      messagingPubkey,
      issueReceipt,
      issueStatement,
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
      accountType,
      businessName,
      accountTypeResolved,
      chooseAccountType,
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
      watchPayments,
      loadLocal,
      saveLocal,
      send,
      claimKey,
      freshPayAddress,
      proposePayments,
      proveProposal,
      revealMnemonic,
      openBox,
      messagingPubkey,
      issueReceipt,
      issueStatement,
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
