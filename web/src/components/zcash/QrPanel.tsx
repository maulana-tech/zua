"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { dashButtonPrimary, dashButtonSecondary } from "../dashboard/styles";

/** Both ends of a long address or URI, which is what people compare. */
const shorten = (text: string) =>
  text.length > 30 ? `${text.slice(0, 16)}…${text.slice(-10)}` : text;

/** QR for a zcash: payment URI, with copy and "open in wallet" actions. */
export function QrPanel({
  uri,
  copyText,
  copyLabel = "Copy address",
}: {
  uri: string;
  copyText: string;
  copyLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="grid gap-4">
      <div className="mx-auto aspect-square w-full max-w-64 rounded-(--dash-radius-sm) bg-[#fff] p-3 ring-1 ring-(--dash-line-solid)">
        <QRCodeSVG
          value={uri}
          size={320}
          level="M"
          fgColor="#0D0C14"
          bgColor="#FFFFFF"
          className="size-full"
          aria-label="Zcash payment QR code"
        />
      </div>
      <div className="flex items-start gap-2 rounded-(--dash-radius-sm) border border-(--dash-line) bg-(--dash-tint) py-2 pr-2 pl-3">
        <p
          className="min-w-0 flex-1 py-0.5 font-mono text-[11px] leading-5 break-all text-(--dash-ash)"
          title={copyText}
        >
          {full ? copyText : shorten(copyText)}
        </p>
        {copyText.length > 30 ? (
          <button
            type="button"
            aria-expanded={full}
            onClick={() => setFull((v) => !v)}
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-(--dash-fg) uppercase hover:bg-(--dash-tint) focus-visible:ring-2 focus-visible:ring-(--dash-fg) focus-visible:outline-none"
          >
            {full ? "Less" : "Full"}
          </button>
        ) : null}
      </div>
      <div className="grid gap-2">
        <a className={`${dashButtonPrimary} w-full`} href={uri}>
          <ExternalLink aria-hidden="true" />
          Open in wallet
        </a>
        <button
          type="button"
          className={`${dashButtonSecondary} w-full`}
          onClick={copy}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Copied" : copyLabel}</span>
        </button>
      </div>
    </div>
  );
}
