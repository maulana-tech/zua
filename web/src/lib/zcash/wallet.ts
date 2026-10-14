"use client";

import type * as WebZjs from "@chainsafe/webzjs-wallet";
import { lightwalletdUrl, minConfirmations, network } from "./network";

// Thin wrapper over the WebZjs wallet (WASM). One instance per page: the
// library spawns its own proving/sync workers and must be initialised once.

let modulePromise: Promise<typeof WebZjs> | null = null;

export function loadWebZjs(): Promise<typeof WebZjs> {
  modulePromise ??= (async () => {
    const z = await import("@chainsafe/webzjs-wallet");
    await z.default();
    // Threads need cross-origin isolation (COOP/COEP); without it, prove on
    // one thread rather than failing.
    const threads = self.crossOriginIsolated
      ? Math.min(navigator.hardwareConcurrency || 4, 8)
      : 1;
    await z.initThreadPool(threads);
    return z;
  })();
  modulePromise.catch(() => {
    modulePromise = null;
  });
  return modulePromise;
}

export type Balances = {
  orchard: bigint;
  sapling: bigint;
  transparent: bigint;
  pendingChange: bigint;
  pendingSpendable: bigint;
  /** Shielded funds the user can spend now. */
  spendable: bigint;
};

export type WalletTx = {
  txid: string;
  kind: "received" | "sent" | "internal";
  /** Net change in zatoshi: positive in, negative out. */
  value: bigint;
  fee: bigint | null;
  height: number | null;
  confirmations: number;
  pending: boolean;
  memos: string[];
  timestamp: number | null; // ms
  pool: string;
};

export type SyncState = { tip: number; scanned: number };

const big = (v: unknown) =>
  v == null ? 0n : BigInt(v as string | number | bigint);

function txKind(raw: unknown): WalletTx["kind"] {
  if (raw === 0 || raw === "Received") return "received";
  if (raw === 1 || raw === "Sent") return "sent";
  return "internal";
}

export class ZcashWallet {
  private constructor(
    private readonly z: typeof WebZjs,
    private readonly inner: WebZjs.WebWallet,
    readonly accountId: number,
  ) {}

  /** Restores from a cached DB when given, else creates the account. */
  static async open(opts: {
    mnemonic: string;
    birthday: number;
    db?: Uint8Array | null;
  }): Promise<ZcashWallet> {
    const z = await loadWebZjs();
    if (opts.db) {
      try {
        const inner = new z.WebWallet(
          network,
          lightwalletdUrl,
          minConfirmations,
          1,
          opts.db,
        );
        const summary = await inner.get_wallet_summary();
        const id = firstAccountId(summary);
        if (id !== null) return new ZcashWallet(z, inner, id);
      } catch {
        // Corrupt or incompatible cache: fall through to a fresh account.
      }
    }
    const inner = new z.WebWallet(
      network,
      lightwalletdUrl,
      minConfirmations,
      1,
      null,
    );
    const id = await inner.create_account(
      "main",
      opts.mnemonic,
      0,
      opts.birthday,
    );
    return new ZcashWallet(z, inner, id);
  }

  /** Current chain tip from lightwalletd (used to pick a birthday). */
  static async latestBlock(): Promise<number> {
    const z = await loadWebZjs();
    const probe = new z.WebWallet(
      network,
      lightwalletdUrl,
      minConfirmations,
      1,
      null,
    );
    try {
      return Number(await probe.get_latest_block());
    } finally {
      probe.free();
    }
  }

  /** Address that receives to Orchard (and Sapling) for this account. */
  address(): Promise<string> {
    return this.inner.get_current_address(this.accountId);
  }

  sync(): Promise<void> {
    return this.inner.sync();
  }

  async status(): Promise<{ sync: SyncState; balances: Balances }> {
    const summary = await this.inner.get_wallet_summary();
    const sync = {
      tip: summary?.chain_tip_height ?? 0,
      scanned: summary?.fully_scanned_height ?? 0,
    };
    const entry = (
      summary?.account_balances as
        | [number, Record<string, unknown>][]
        | undefined
    )?.find(([id]) => id === this.accountId)?.[1];
    const orchard = big(entry?.orchard_balance);
    const sapling = big(entry?.sapling_balance);
    const pendingChange = big(entry?.pending_change);
    const pendingSpendable = big(entry?.pending_spendable);
    return {
      sync,
      balances: {
        orchard,
        sapling,
        transparent: big(entry?.unshielded_balance),
        pendingChange,
        pendingSpendable,
        spendable: orchard + sapling,
      },
    };
  }

  async history(limit = 100): Promise<WalletTx[]> {
    const res = await this.inner.get_transaction_history(
      this.accountId,
      limit,
      0,
    );
    const rows = (res.transactions ?? []) as Record<string, unknown>[];
    return rows.map((r) => ({
      txid: String(r.txid),
      kind: txKind(r.tx_type),
      value: big(r.value),
      fee: r.fee == null ? null : big(r.fee),
      height: (r.block_height as number | undefined) ?? null,
      confirmations: Number(r.confirmations ?? 0),
      pending: r.status === 1 || r.status === "Pending",
      memos: typeof r.memo === "string" && r.memo ? r.memo.split("\n") : [],
      timestamp: r.timestamp == null ? null : Number(r.timestamp) * 1000,
      pool: String(r.pool ?? ""),
    }));
  }

  /**
   * Proposes, proves (Halo 2, ~10 s) and broadcasts a payment. Returns the
   * transaction ids in explorer (display) order.
   */
  async send(opts: {
    mnemonic: string;
    to: string;
    amountZat: bigint;
    memo?: string;
    onStage?: (stage: "proposing" | "proving" | "broadcasting") => void;
  }): Promise<string[]> {
    opts.onStage?.("proposing");
    const proposal = await this.inner.propose_transfer_with_memo(
      this.accountId,
      opts.to,
      opts.amountZat,
      opts.memo || null,
    );
    opts.onStage?.("proving");
    const txids = await this.inner.create_proposed_transactions(
      proposal,
      opts.mnemonic,
      0,
    );
    opts.onStage?.("broadcasting");
    await this.inner.send_authorized_transactions(txids);
    return splitTxids(txids);
  }

  /** Serialized wallet DB for the encrypted cache. */
  export(): Promise<Uint8Array> {
    return this.inner.db_to_bytes();
  }

  close(): void {
    this.inner.free();
  }
}

function firstAccountId(
  summary: WebZjs.WalletSummary | undefined,
): number | null {
  const balances = summary?.account_balances as [number, unknown][] | undefined;
  return balances?.length ? balances[0][0] : null;
}

/** 32-byte txids, reversed into the hex order explorers display. */
export function splitTxids(bytes: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i + 32 <= bytes.length; i += 32) {
    const id = bytes.slice(i, i + 32).reverse();
    out.push(Array.from(id, (b) => b.toString(16).padStart(2, "0")).join(""));
  }
  return out;
}
