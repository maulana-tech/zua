"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { dashButtonPrimary, dashButtonSecondary } from "../dashboard/styles";

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
  async function copy() {
    await navigator.clipboard?.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="grid gap-4">
      <div className="mx-auto aspect-square w-full max-w-72 rounded-(--dash-radius-sm) bg-[#fff] p-4">
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
      <p className="break-all rounded-(--dash-radius-sm) border border-(--dash-line) bg-(--dash-tint) p-3 font-mono text-[11px] leading-5 text-(--dash-ash)">
        {copyText}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={dashButtonSecondary} onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : copyLabel}
        </button>
        <a className={dashButtonPrimary} href={uri}>
          <ExternalLink aria-hidden="true" />
          Open in wallet
        </a>
      </div>
    </div>
  );
}
