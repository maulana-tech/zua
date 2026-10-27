"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  FileText,
  Gift,
  Link2,
  ReceiptText,
  Store,
  Users,
} from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { nextTabIndex } from "./hooks";
import {
  ClaimDemo,
  InvoiceDemo,
  LinksDemo,
  PayrollDemo,
  PosDemo,
  ReceiptDemo,
  RequestsDemo,
} from "./ProductDemos";
import { Frame, MonoLabel, panel, SectionIntro } from "./primitives";

type Feature = {
  id: string;
  group: "Get paid" | "Pay" | "Prove";
  icon: LucideIcon;
  tab: string;
  title: string;
  body: string;
  points: string[];
  keepsPrivate: string;
  Demo: ComponentType;
};

export const FEATURES: Feature[] = [
  {
    id: "links",
    group: "Get paid",
    icon: Link2,
    tab: "Payment links",
    title: "A link for your @username and for everything you sell",
    body: "A public page for your @username, plus one per product or service. Each shows a ZIP-321 QR code that any shielded Zcash wallet can pay. Payers don't need a Zua account.",
    points: [
      "Fixed price, or let the payer choose the amount",
      "A one-line “Pay with Zcash” button for your own site",
      "Every link pays its own address, signed by you",
    ],
    keepsPrivate: "Two payers can't tell they paid the same person.",
    Demo: LinksDemo,
  },
  {
    id: "invoices",
    group: "Get paid",
    icon: FileText,
    tab: "Invoices",
    title: "Invoices that mark themselves paid",
    body: "Each invoice carries an encrypted memo tag. When your wallet syncs and finds a payment with that tag, the invoice turns paid, partial payments included. Try it in the demo.",
    points: [
      "PDF export and a receipt email for your client",
      "Weekly or monthly invoices that issue themselves, with reminders",
      "Bill in USD, paid in ZEC at a rate locked for 30 minutes",
    ],
    keepsPrivate:
      "Zua learns an invoice is paid from your wallet, never the transaction that paid it.",
    Demo: InvoiceDemo,
  },
  {
    id: "pos",
    group: "Get paid",
    icon: Store,
    tab: "Point of sale",
    title: "A counter screen for cafés and shops",
    body: "Type the price in your own currency, turn the screen to the customer, and the sale turns paid when your wallet finds it. The keypad below is the real one, at today's rate.",
    points: [
      "Prices in 24 currencies, always paid in ZEC",
      "Full-screen customer view that keeps the screen awake",
      "Today's total, a sales log and CSV export",
    ],
    keepsPrivate:
      "Sales are kept encrypted on your device. The server never hears about a sale.",
    Demo: PosDemo,
  },
  {
    id: "requests",
    group: "Get paid",
    icon: ArrowDownLeft,
    tab: "Requests",
    title: "Ask anyone on Zua to pay you",
    body: "Send a payment request to another @username with an amount and a note. They pay it in one tap, and both of you see it settle.",
    points: [
      "Shows up in their Requests, and by email if they opted in",
      "Paid status updates on both sides",
      "Works between personal and business accounts",
    ],
    keepsPrivate:
      "The request is end-to-end encrypted. Zua stores ciphertext only.",
    Demo: RequestsDemo,
  },
  {
    id: "payroll",
    group: "Pay",
    icon: Users,
    tab: "Send & payroll",
    title: "Pay one person or fifty in one shielded transaction",
    body: "Send to a @username, an address or a zcash: link with a private note. Payroll pays up to 50 people at once, from a form or a CSV. Your browser builds the zero-knowledge proof.",
    points: [
      "Every @username is re-verified before each send",
      "Each person sees only their own payment and note",
      "The exact network fee is shown before you confirm",
    ],
    keepsPrivate: "Outsiders see neither the amounts nor who was paid.",
    Demo: PayrollDemo,
  },
  {
    id: "claims",
    group: "Pay",
    icon: Gift,
    tab: "Claim links",
    title: "Send ZEC to someone who has no wallet yet",
    body: "Put ZEC in a link and share it in any private chat. They claim it into a new Zua account or any Zcash address.",
    points: [
      "The key lives after the # and never reaches a server",
      "Take the funds back any time before they're claimed",
      "Check whether it has been claimed from your dashboard",
    ],
    keepsPrivate: "Whoever holds the link can claim it, so share it privately.",
    Demo: ClaimDemo,
  },
  {
    id: "receipts",
    group: "Prove",
    icon: ReceiptText,
    tab: "Receipts",
    title: "Prove a payment without opening your books",
    body: "Turn payments into a file anyone can check: a receipt for money received, a proof of payment for money sent, or an income statement for your accountant. /verify decrypts just those payments from the chain.",
    points: [
      "Amounts and memos are proven on chain",
      "Signatures are checked against the signer's profile",
      "Edited files are rejected. Flip the demo to see it",
    ],
    keepsPrivate: "No viewing key, balance or other payment is revealed.",
    Demo: ReceiptDemo,
  },
];

export function ProductSuite() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const feature = FEATURES[active];
  const Demo = feature.Demo;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextTabIndex(event.key, i, FEATURES.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
    tabs.current[next]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  };

  return (
    <section
      id="product"
      data-ed-section
      aria-labelledby="product-title"
      className="relative py-24 sm:py-32"
    >
      <Frame>
        <SectionIntro
          label="Product"
          titleId="product-title"
          title="Everything you need to take ZEC privately"
        >
          Get paid, pay people and prove it, from one account. Pick a tool: each
          demo below runs in your browser and works like the real thing.
        </SectionIntro>

        <div
          className={cn(panel, "mt-14 grid lg:grid-cols-[260px_minmax(0,1fr)]")}
        >
          <div
            role="tablist"
            aria-label="Zua tools"
            className="flex gap-1 overflow-x-auto border-b border-starlight/10 p-2 lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0 lg:p-3"
          >
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              const selected = i === active;
              const firstOfGroup = i === 0 || FEATURES[i - 1].group !== f.group;
              return (
                <div key={f.id} className="contents">
                  {firstOfGroup ? (
                    <MonoLabel
                      aria-hidden="true"
                      className={cn(
                        "hidden px-3 pb-1.5 text-[11px] text-starlight/45 lg:block",
                        i === 0 ? "pt-2" : "pt-5",
                      )}
                    >
                      {f.group}
                    </MonoLabel>
                  ) : null}
                  <button
                    ref={(el) => {
                      tabs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`product-tab-${f.id}`}
                    aria-selected={selected}
                    aria-controls="product-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(i)}
                    onKeyDown={(event) => onKeyDown(event, i)}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center gap-3 px-3 text-left text-[15px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet",
                      selected
                        ? "bg-starlight text-void"
                        : "text-starlight/70 hover:bg-starlight/5 hover:text-starlight",
                    )}
                  >
                    <Icon
                      className="size-4 shrink-0"
                      strokeWidth={1.7}
                      aria-hidden="true"
                    />
                    {f.tab}
                  </button>
                </div>
              );
            })}
          </div>

          <div
            id="product-panel"
            role="tabpanel"
            aria-labelledby={`product-tab-${feature.id}`}
            className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]"
          >
            <div className="flex flex-col p-6 sm:p-10">
              <MonoLabel className="text-[11px] text-(--signal-ink)">
                {feature.group} · {feature.tab}
              </MonoLabel>
              <h3 className="mt-3 max-w-[24ch] text-[clamp(1.5rem,2.2vw,2rem)] font-normal leading-tight tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-starlight/70">
                {feature.body}
              </p>
              <ul className="mt-6 grid list-none gap-3">
                {feature.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-3 text-[15px] leading-relaxed"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2.5 size-1.5 shrink-0 rounded-full bg-violet"
                    />
                    {point}
                  </li>
                ))}
              </ul>
              <dl className="mt-auto border-t border-starlight/10 pt-5 max-xl:mt-8">
                <dt>
                  <MonoLabel className="text-[11px] text-starlight/50">
                    Stays private
                  </MonoLabel>
                </dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed">
                  {feature.keepsPrivate}
                </dd>
              </dl>
            </div>
            <div className="flex items-center justify-center border-t border-starlight/10 bg-void p-5 sm:p-8 xl:border-t-0 xl:border-l">
              <div
                key={feature.id}
                className="w-full max-w-[400px] motion-safe:animate-[mock-in_500ms_ease-out]"
              >
                <Demo />
              </div>
            </div>
          </div>
        </div>
      </Frame>
    </section>
  );
}
