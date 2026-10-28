"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { type EmbedConfig, embedSnippet } from "../../features/embed/snippet";
import { Segmented } from "../dashboard/Segmented";
import { dashButtonPrimary, dashButtonSecondary } from "../dashboard/styles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

/** Copy-paste code for a "Pay with Zcash" button on any website. */
export function EmbedCodeDialog({
  open,
  onOpenChange,
  config,
  title = "Add to your website",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: EmbedConfig;
  title?: string;
}) {
  const [origin, setOrigin] = useState("");
  const [mode, setMode] = useState<"button" | "inline">("button");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const full: EmbedConfig = { ...config, mode, theme };
  const code = origin ? embedSnippet(origin, full) : "";
  const demo = origin
    ? `${origin}/embed-demo.html?${new URLSearchParams(
        Object.entries(full).filter(([, v]) => v) as [string, string][],
      )}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent appearance="linen" size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Paste this where the button should appear (a shop, a blog, a
            portfolio). Payers pay from any Zcash wallet; the payment is
            shielded and never passes through that site or Zua.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 text-sm font-medium">
            <span id="embed-style-label">Style</span>
            <Segmented
              aria-labelledby="embed-style-label"
              value={mode}
              onChange={setMode}
              options={[
                { value: "button", label: "Button + dialog" },
                { value: "inline", label: "Inline" },
              ]}
            />
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <span id="embed-theme-label">Theme</span>
            <Segmented
              aria-labelledby="embed-theme-label"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
          </div>
        </div>
        <pre className="max-h-48 overflow-auto rounded-(--dash-radius-sm) border border-(--dash-line) bg-(--dash-tint) p-3 font-mono text-xs whitespace-pre-wrap break-all">
          {code}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={dashButtonPrimary}
            disabled={!code}
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy code"}
          </button>
          <a
            className={dashButtonSecondary}
            href={demo}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink aria-hidden="true" /> Try it on a demo page
          </a>
        </div>
        <p className="text-xs text-(--dash-ash)">
          Your site can listen for <code>zua:paid</code> (invoices, once your
          wallet syncs) and <code>zua:payer-says-paid</code> events.
        </p>
      </DialogContent>
    </Dialog>
  );
}
