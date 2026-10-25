"use client";

import { toast } from "sonner";
import { zatToZec } from "../../lib/zcash/units";
import type { WalletTx } from "../../lib/zcash/wallet";
import { describeTx } from "./describeTx";

// Announces payments the wallet just found. Everything happens on this device:
// the server never learns that a payment arrived (there is no server-side
// scanning to push from), so alerts need the app open, in any tab.

export type AlertPrefs = {
  /** A short chime with each payment. */
  sound: boolean;
  /** A system notification while Zua is in a background tab. */
  system: boolean;
};

const PREFS_KEY = "zua:payment-alerts";
const DEFAULT_PREFS: AlertPrefs = { sound: false, system: false };

export function loadAlertPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveAlertPrefs(prefs: AlertPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode: alerts fall back to the defaults
  }
}

/** Incoming payments in `history` that `seen` doesn't have yet. */
export function newIncoming(
  history: readonly WalletTx[],
  seen: ReadonlySet<string>,
): WalletTx[] {
  return history.filter(
    (tx) => tx.kind === "received" && tx.value > 0n && !seen.has(tx.txid),
  );
}

export function systemNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** A soft two-note chime. Silent when the browser blocks audio. */
export function chime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.45);
    }
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {}
}

const MAX_TOASTS = 3;

/**
 * Toasts each payment (or a summary when there are many), chimes, and posts
 * a system notification when the tab is hidden. `whileAway` words it as
 * payments that arrived since the last visit.
 */
export function announcePayments(
  txs: readonly WalletTx[],
  { whileAway = false }: { whileAway?: boolean } = {},
): void {
  if (!txs.length) return;
  const prefs = loadAlertPrefs();
  const total = txs.reduce((sum, tx) => sum + tx.value, 0n);

  if (whileAway || txs.length > MAX_TOASTS) {
    toast.success(
      whileAway
        ? `${txs.length} payment${txs.length === 1 ? "" : "s"} arrived while you were away`
        : `${txs.length} payments received`,
      { description: `${zatToZec(total)} ZEC in total` },
    );
  } else {
    for (const tx of txs)
      toast.success(`Received ${zatToZec(tx.value)} ZEC`, {
        description: describeTx(tx),
      });
  }

  if (prefs.sound) chime();
  if (
    prefs.system &&
    document.visibilityState === "hidden" &&
    systemNotificationsSupported() &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification(
        txs.length === 1
          ? `Received ${zatToZec(total)} ZEC`
          : `Received ${txs.length} payments`,
        {
          body:
            txs.length === 1 ? describeTx(txs[0]) : `${zatToZec(total)} ZEC`,
          icon: "/pwa/icon-192.png",
          tag: "zua-payment",
        },
      );
    } catch {}
  }
}
