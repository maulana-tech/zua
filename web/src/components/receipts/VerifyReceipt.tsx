"use client";

import { CheckCircle2, CircleAlert, Loader } from "lucide-react";
import { useRef, useState } from "react";
import {
  parseReceipt,
  type Receipt,
  receiptSignatureValid,
} from "../../features/receipts/receipt";
import { verifyClaim } from "../../lib/profileClaim";
import { latestHeight, transactionHeight } from "../../lib/zcash/lightwalletd";
import {
  explorerTxUrl,
  lightwalletdUrl,
  network,
} from "../../lib/zcash/network";
import { zatToZec } from "../../lib/zcash/units";
import { api } from "../../trpc/client";
import { dashButtonSecondary } from "../dashboard/styles";

type Result =
  | { status: "verified"; confirmations: number }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string };

async function verify(receipt: Receipt): Promise<Result> {
  if (receipt.network !== network)
    return {
      status: "invalid",
      reason: `This receipt is for Zcash ${receipt.network === "main" ? "mainnet" : "testnet"}.`,
    };
  const profile = await api.profiles.byUsername.query({
    username: receipt.recipient.username,
  });
  const claim = profile
    ? verifyClaim(profile.claimJson, profile.claimSigHex)
    : null;
  if (!claim || claim.username !== receipt.recipient.username)
    return {
      status: "invalid",
      reason: `@${receipt.recipient.username} doesn't exist or its profile can't be verified.`,
    };
  if (claim.ua !== receipt.recipient.ua)
    return {
      status: "invalid",
      reason:
        "The address on the receipt doesn't match the recipient's profile.",
    };
  if (!receiptSignatureValid(receipt, claim.signPubkeyHex))
    return {
      status: "invalid",
      reason:
        "The signature doesn't match. The receipt was edited or not issued by this user.",
    };
  try {
    const [height, tip] = await Promise.all([
      transactionHeight(lightwalletdUrl, receipt.txid),
      latestHeight(lightwalletdUrl),
    ]);
    if (height === null)
      return {
        status: "invalid",
        reason: "This transaction isn't on the Zcash blockchain.",
      };
    if (height !== receipt.height)
      return {
        status: "invalid",
        reason: `The transaction is in block ${height}, not ${receipt.height} as the receipt says.`,
      };
    return { status: "verified", confirmations: Math.max(0, tip - height + 1) };
  } catch (e) {
    return {
      status: "unavailable",
      reason:
        e instanceof Error ? e.message : "Couldn't reach the Zcash network.",
    };
  }
}

export function VerifyReceipt() {
  const input = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(file: File) {
    setError("");
    setResult(null);
    setReceipt(null);
    if (file.size > 64 * 1024)
      return setError("This file is too large to be a receipt.");
    try {
      const parsed = parseReceipt(await file.text());
      setReceipt(parsed);
      setBusy(true);
      setResult(await verify(parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : "This file couldn't be read.");
    } finally {
      setBusy(false);
    }
  }

  const url = receipt ? explorerTxUrl(receipt.txid) : null;

  return (
    <section
      className="w-full min-w-0 rounded-(--dash-radius) border border-(--dash-line-solid) bg-(--dash-surface) p-6 text-(--dash-fg) sm:p-8"
      aria-label="Receipt verification"
    >
      <p className="dashboard-tile-title">Zua verify</p>
      <h1 className="mt-5 text-3xl font-normal tracking-tight">
        Check a payment receipt
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-(--dash-ash)">
        Choose the receipt JSON you were given. We check the recipient&apos;s
        signature against their public profile and confirm the transaction on
        the Zcash blockchain. Nothing is uploaded.
      </p>
      <label
        className="mt-6 grid gap-2 text-sm font-semibold"
        htmlFor="receipt-json"
      >
        Receipt JSON
        <input
          ref={input}
          id="receipt-json"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void load(file);
          }}
          className="min-h-14 w-full cursor-pointer rounded-(--dash-radius-sm) border border-dashed border-(--dash-line-strong) bg-(--dash-tint) px-3 py-3 text-sm text-(--dash-ash) file:mr-3 file:rounded-full file:border-0 file:bg-(--dash-fg) file:px-4 file:py-2 file:text-xs file:font-semibold file:text-(--dash-surface) file:uppercase"
        />
      </label>
      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {busy || result ? (
        <div
          aria-live="polite"
          className="mt-7 border-t border-(--dash-line) pt-6"
        >
          <div className="flex items-center gap-2">
            {busy ? (
              <Loader
                className="size-5 motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : result?.status === "verified" ? (
              <CheckCircle2 className="size-5" aria-hidden="true" />
            ) : (
              <CircleAlert
                className="size-5 text-destructive"
                aria-hidden="true"
              />
            )}
            <h2 className="text-lg font-semibold">
              {busy
                ? "Checking…"
                : result?.status === "verified"
                  ? "Verified on Zcash"
                  : result?.status === "invalid"
                    ? "Not valid"
                    : "Couldn't verify right now"}
            </h2>
          </div>
          {result && result.status !== "verified" ? (
            <p className="mt-2 text-sm text-(--dash-ash)">{result.reason}</p>
          ) : null}
          {result?.status === "verified" && receipt ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-(--dash-ash)">Received by</dt>
                <dd className="mt-1">
                  @{receipt.recipient.username} (signature checked)
                </dd>
              </div>
              <div>
                <dt className="text-(--dash-ash)">Amount stated</dt>
                <dd className="mt-1 tabular-nums">
                  {zatToZec(BigInt(receipt.amountZat))} ZEC
                </dd>
              </div>
              <div>
                <dt className="text-(--dash-ash)">Block</dt>
                <dd className="mt-1 tabular-nums">
                  {receipt.height.toLocaleString("en-US")} ·{" "}
                  {result.confirmations} confirmations
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-(--dash-ash)">Transaction</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {receipt.txid}
                    </a>
                  ) : (
                    receipt.txid
                  )}
                </dd>
              </div>
              {receipt.memo ? (
                <div className="sm:col-span-2">
                  <dt className="text-(--dash-ash)">Memo</dt>
                  <dd className="mt-1 break-words">{receipt.memo}</dd>
                </div>
              ) : null}
              <p className="text-xs text-(--dash-ash) sm:col-span-2">
                The transaction is shielded, so its amount is stated by the
                recipient&apos;s signature rather than read from the chain.
              </p>
            </dl>
          ) : null}
          {result ? (
            <button
              type="button"
              className={`${dashButtonSecondary} mt-6`}
              onClick={() => {
                setResult(null);
                setReceipt(null);
                if (input.current) input.current.value = "";
              }}
            >
              Check another
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
