"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Frame,
  MonoLabel,
  SectionIntro,
  segmentButton,
  segmentGroup,
} from "./primitives";

type Layer = "device" | "standards" | "trust";

const LAYERS: { id: Layer | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "device", label: "On your device" },
  { id: "standards", label: "Zcash standards" },
  { id: "trust", label: "Trust & proof" },
];

const LAYER_LABEL: Record<Layer, string> = {
  device: "On your device",
  standards: "Zcash standard",
  trust: "Trust & proof",
};

const SPECS: {
  tag: string;
  layer: Layer;
  title: string;
  body: string;
  href?: string;
}[] = [
  {
    tag: "WebZjs · WASM",
    layer: "device",
    title: "A full wallet in the page",
    body: "Our fork of WebZjs compiles librustzcash to WebAssembly: NU6.3 on mainnet, NU7 on testnet. It syncs compact blocks from lightwalletd and decrypts your notes in the browser.",
  },
  {
    tag: "Orchard · Halo 2",
    layer: "device",
    title: "Proofs built on your device",
    body: "Your browser builds the zero-knowledge proof for every payment you send, on several threads where the page allows it. Halo 2 needs no trusted setup.",
    href: "https://zcash.github.io/halo2/",
  },
  {
    tag: "Passkey PRF · PIN",
    layer: "device",
    title: "Keys that stay in the page",
    body: "Your key comes from a passkey, or is random and kept encrypted under your PIN with Argon2id and AES-GCM. The synced wallet is cached in IndexedDB, also encrypted.",
  },
  {
    tag: "ZIP-321",
    layer: "standards",
    title: "Payment requests any wallet reads",
    body: "Links, invoices, checkouts and sales are zcash: URIs and QR codes with the amount and memo filled in, so any shielded Zcash wallet can pay them.",
    href: "https://zips.z.cash/zip-0321",
  },
  {
    tag: "ZIP-316",
    layer: "standards",
    title: "A fresh address for every invoice",
    body: "Unified addresses with their own diversifier. Each invoice, link and checkout gets one, and no one can tell they lead to the same wallet.",
    href: "https://zips.z.cash/zip-0316",
  },
  {
    tag: "ZIP-317",
    layer: "standards",
    title: "Fees you see before you send",
    body: "0.0001 ZEC for a simple payment, a little more for each extra recipient in a payroll. The exact fee shows before you confirm.",
    href: "https://zips.z.cash/zip-0317",
  },
  {
    tag: "Payment disclosure",
    layer: "trust",
    title: "Receipts the chain can check",
    body: "A receipt discloses only the payments it lists. /verify decrypts those outputs from the chain and checks the signature against the signer's profile.",
  },
  {
    tag: "Ed25519",
    layer: "trust",
    title: "Usernames the server can't forge",
    body: "Your @username and every address you receive at are signed by a key only your browser can derive. Payers check it before they see a QR.",
  },
  {
    tag: "X25519 · AES-GCM",
    layer: "trust",
    title: "Requests sealed end to end",
    body: "Payment requests between Zua users are encrypted to the recipient's key. The server stores ciphertext it can't open.",
  },
];

export function UnderTheHood() {
  const [layer, setLayer] = useState<Layer | "all">("all");

  return (
    <section
      id="tech"
      data-ed-section
      aria-labelledby="tech-title"
      className="relative py-24 sm:py-32"
    >
      <Frame>
        <SectionIntro
          label="Under the hood"
          titleId="tech-title"
          title="Built on Zcash, not around it"
        >
          No custody, no mixer, no private ledger. Zua is a Zcash wallet in your
          browser plus the standards that make it work with every other wallet.
        </SectionIntro>

        <fieldset className={cn(segmentGroup, "mt-12")}>
          <legend className="sr-only">Highlight a layer</legend>
          {LAYERS.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={layer === l.id}
              onClick={() => setLayer(l.id)}
              className={segmentButton}
            >
              {l.label}
            </button>
          ))}
        </fieldset>

        {/* 1px gaps over a tinted background draw the hairline grid. */}
        <ul className="mt-6 grid list-none gap-px border border-starlight/10 bg-starlight/10 sm:grid-cols-2 lg:grid-cols-3">
          {SPECS.map((spec) => {
            const dim = layer !== "all" && layer !== spec.layer;
            return (
              <li
                key={spec.tag}
                data-ed-article
                data-dim={dim}
                className="flex flex-col bg-void-2 p-7 transition-opacity duration-300 data-[dim=true]:opacity-35 sm:p-8"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <MonoLabel className="text-[11px] text-(--signal-ink)">
                    {spec.tag}
                  </MonoLabel>
                  <span className="text-xs text-starlight/60">
                    {LAYER_LABEL[spec.layer]}
                  </span>
                </div>
                <h3 className="mt-8 text-xl font-normal leading-snug tracking-tight">
                  {spec.title}
                </h3>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-starlight/65">
                  {spec.body}
                </p>
                {spec.href ? (
                  <a
                    href={spec.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex items-center gap-1 self-start text-sm text-(--signal-ink) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                  >
                    Read the spec
                    <span className="sr-only"> for {spec.tag}</span>
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Frame>
    </section>
  );
}
