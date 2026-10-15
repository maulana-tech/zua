"use client";

import { CheckCircle2, CircleAlert, Loader } from "lucide-react";
import { useRef, useState } from "react";
import { parseReceipt, type Receipt } from "../../features/receipts/receipt";
import {
  type VerifyResult,
  verifyReceipt,
} from "../../features/receipts/verify";
import { latestHeight, rawTransaction } from "../../lib/zcash/lightwalletd";
import {
  explorerTxUrl,
  lightwalletdUrl,
  network,
} from "../../lib/zcash/network";
import { zatToZec } from "../../lib/zcash/units";
import { api } from "../../trpc/client";
import { dashButtonSecondary } from "../dashboard/styles";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // a statement of a few hundred payments

const TITLES = {
  received: "Payment receipt",
  sent: "Proof of payment",
  statement: "Income statement",
} as const;

async function check(receipt: Receipt): Promise<VerifyResult> {
  const { verifyDisclosure } = await import("../../lib/zcash/wallet");
  return verifyReceipt(receipt, {
    network,
    profile: (username) => api.profiles.byUsername.query({ username }),
    addressOwner: (ua) => api.profiles.addressOwner.query({ ua }),
    rawTransaction: (txid) => rawTransaction(lightwalletdUrl, txid),
    latestHeight: () => latestHeight(lightwalletdUrl),
    verifyDisclosure,
  });
}

export function VerifyReceipt() {
  const input = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(file: File) {
    setError("");
    setResult(null);
    setReceipt(null);
    if (file.size > MAX_FILE_BYTES)
      return setError("This file is too large to be a receipt.");
    try {
      const parsed = parseReceipt(await file.text());
      setReceipt(parsed);
      setBusy(true);
      setResult(await check(parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : "This file couldn't be read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="w-full min-w-0 rounded-(--dash-radius) border border-(--dash-line-solid) bg-(--dash-surface) p-6 text-(--dash-fg) sm:p-8"
      aria-label="Receipt verification"
    >
      <p className="dashboard-tile-title">Zua verify</p>
      <h1 className="mt-5 text-3xl font-normal tracking-tight">
        Check a receipt, proof of payment or statement
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-(--dash-ash)">
        Choose the JSON file you were given. Your browser fetches the shielded
        transactions, decrypts only the outputs the file opens and checks them
        against the Zcash blockchain, then checks the signature against the
        signer&apos;s public profile. Nothing is uploaded.
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
            <Verified receipt={receipt} result={result} />
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

function Verified({
  receipt,
  result,
}: {
  receipt: Receipt;
  result: Extract<VerifyResult, { status: "verified" }>;
}) {
  const single = result.items.length === 1 ? result.items[0] : null;
  return (
    <div className="mt-4 grid gap-4 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-(--dash-ash)">{TITLES[receipt.kind]}</dt>
          <dd className="mt-1">
            {receipt.kind === "sent" ? "Paid by" : "Received by"} @
            {receipt.signer} (signature checked)
          </dd>
        </div>
        <div>
          <dt className="text-(--dash-ash)">
            {result.items.length > 1
              ? `Total of ${result.items.length} payments (proven on chain)`
              : "Amount (proven on chain)"}
          </dt>
          <dd className="mt-1 tabular-nums">{zatToZec(result.totalZat)} ZEC</dd>
        </div>
        {receipt.period ? (
          <div className="sm:col-span-2">
            <dt className="text-(--dash-ash)">Period</dt>
            <dd className="mt-1">
              {receipt.period.from} to {receipt.period.to} (UTC)
            </dd>
          </div>
        ) : null}
        {receipt.kind === "sent" && single ? (
          <div className="sm:col-span-2">
            <dt className="text-(--dash-ash)">Paid to</dt>
            <dd className="mt-1">
              {single.recipient
                ? `@${single.recipient}`
                : "A shielded address not registered on Zua"}
            </dd>
          </div>
        ) : null}
      </dl>
      <ul className="grid gap-2">
        {result.items.map((item) => {
          const url = explorerTxUrl(item.txid);
          return (
            <li
              key={`${item.txid}-${item.amountZat}`}
              className="rounded-(--dash-radius-sm) border border-(--dash-line) p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="tabular-nums">
                  {zatToZec(item.amountZat)} ZEC
                  {receipt.kind === "sent" && item.recipient
                    ? ` to @${item.recipient}`
                    : ""}
                </span>
                <span className="text-xs text-(--dash-ash) tabular-nums">
                  Block {item.height.toLocaleString("en-US")} ·{" "}
                  {item.confirmations} confirmations
                </span>
              </div>
              {item.memo ? (
                <p className="mt-1 break-words text-(--dash-ash)">
                  Memo: {item.memo}
                </p>
              ) : null}
              <p className="mt-1 break-all font-mono text-[11px] text-(--dash-ash)">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {item.txid}
                  </a>
                ) : (
                  item.txid
                )}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-(--dash-ash)">
        The transactions stay shielded. This file opens only the outputs listed
        in it: other payments and balances stay private.
        {receipt.kind === "sent"
          ? " That the signer is the one who paid is their signed statement; the chain proves the payment itself."
          : ""}
      </p>
    </div>
  );
}
