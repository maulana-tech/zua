"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  AtSign,
  BadgeCheck,
  Check,
  Fingerprint,
  QrCode,
  ScanSearch,
  Wallet,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Mascot } from "../Mascot";
import { nextTabIndex, useInView, useReducedMotion } from "./hooks";
import { FauxQr, MockButton, MockRow, MockWindow } from "./mocks";
import { Frame, MonoLabel } from "./primitives";

const STEPS: {
  icon: LucideIcon;
  title: string;
  body: string;
  mock: () => ReactNode;
}[] = [
  {
    icon: AtSign,
    title: "Claim your @username",
    body: "Sign in with email or Google and protect your account with a passkey or a PIN. Your Zcash wallet is created in your browser, with no seed phrase to write down.",
    mock: ClaimMock,
  },
  {
    icon: QrCode,
    title: "Share a link, invoice or QR",
    body: "Clients pay from any shielded Zcash wallet by scanning the QR or tapping “Open in wallet”. They don't need a Zua account.",
    mock: PayMock,
  },
  {
    icon: ScanSearch,
    title: "Your wallet spots the payment",
    body: "While Zua is open, your wallet syncs every few seconds, decrypts what's yours and marks the matching invoice or sale paid. Usually within a minute or two of the payment.",
    mock: DetectMock,
  },
  {
    icon: ArrowUpRight,
    title: "Spend it, or prove it",
    body: "Pay a @username, run payroll or cash out to any Zcash address. Need proof for an accountant? Download a receipt that anyone can check.",
    mock: SpendMock,
  },
];

const AUTO_ADVANCE_MS = 6000;

export function Steps() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // One Steps per page, so a fixed id; useId drifted between SSR and client.
  const baseId = "how-steps";

  // Gently cycle through the steps until the visitor takes over. `active`
  // restarts the countdown whenever the step changes, including by hand.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (paused || reduceMotion || !inView) return;
    const timer = window.setTimeout(
      () => setActive((current) => (current + 1) % STEPS.length),
      AUTO_ADVANCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, paused, reduceMotion, inView]);

  const select = useCallback((index: number, focus = false) => {
    setActive(index);
    setPaused(true);
    if (focus) tabRefs.current[index]?.focus();
  }, []);

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = nextTabIndex(event.key, index, STEPS.length);
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  };

  const Mock = STEPS[active].mock;

  return (
    <section
      ref={sectionRef}
      id="how"
      data-ed-section
      aria-labelledby="how-title"
      className="relative py-24 text-graphite sm:py-32"
    >
      <Frame>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <MonoLabel className="text-graphite/60">How it works</MonoLabel>
            <h2
              id="how-title"
              className="mt-4 text-[clamp(1.9rem,3vw,2.8rem)] font-normal tracking-tight"
            >
              From sign-up to a private balance in four steps
            </h2>
          </div>
          <p className="max-w-[46ch] self-end text-lg leading-relaxed text-graphite/70 lg:justify-self-end">
            No seed phrase, no new wallet for every client, no server watching
            your payments. A link you share and a balance only you can see.
          </p>
        </div>

        <div className="mt-14 grid overflow-hidden rounded-none border border-graphite/10 bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            role="tablist"
            aria-label="Steps"
            aria-orientation="vertical"
            className="flex flex-col"
          >
            {STEPS.map((step, index) => {
              const selected = index === active;
              const Icon = step.icon;
              return (
                <button
                  key={step.title}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${index}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => select(index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  onFocus={() => setPaused(true)}
                  className={cn(
                    "relative flex gap-5 border-b border-graphite/10 px-6 py-7 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet sm:px-9 sm:py-8",
                    selected ? "bg-mist/70" : "hover:bg-mist/40",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-none transition-all",
                      selected
                        ? "bg-starlight text-void"
                        : "border border-graphite/15 text-graphite/55",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <MonoLabel
                      className={cn(
                        "block",
                        selected ? "text-(--signal-ink)" : "text-graphite/45",
                      )}
                    >
                      Step 0{index + 1}
                    </MonoLabel>
                    <span
                      className={cn(
                        "mt-1.5 block text-[1.4rem] font-normal tracking-tight",
                        selected ? "text-graphite" : "text-graphite/60",
                      )}
                    >
                      {step.title}
                    </span>
                    <span
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none",
                        selected
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <span className="min-h-0 overflow-hidden">
                        <span className="block max-w-[40ch] pt-3 text-[15px] leading-relaxed text-graphite/65">
                          {step.body}
                        </span>
                      </span>
                    </span>
                  </span>
                  {selected && !reduceMotion ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-graphite/5"
                    >
                      <span
                        key={`${active}-${paused}-${inView}`}
                        className="block h-full origin-left bg-violet"
                        style={{
                          animation: paused
                            ? "none"
                            : `step-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
                          transform: paused ? "scaleX(1)" : undefined,
                        }}
                      />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            id={`${baseId}-panel`}
            aria-labelledby={`${baseId}-tab-${active}`}
            className="relative isolate flex min-h-[460px] items-center justify-center overflow-hidden bg-void p-6 text-starlight sm:p-10"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-void-2"
            />
            <div
              key={active}
              className="w-full max-w-[420px] motion-safe:animate-[mock-in_500ms_ease-out]"
            >
              <Mock />
            </div>
          </div>
        </div>
      </Frame>
    </section>
  );
}

/* ---- product mocks (decorative copies of real Zua screens) ---------------- */

function ClaimMock() {
  return (
    <MockWindow title="zua">
      <p className="text-lg font-normal">Claim your username</p>
      <p className="mt-1 text-sm text-starlight/55">
        This becomes your payment link.
      </p>
      <div className="mt-5 flex items-center border border-violet/60 bg-void px-3.5 py-3 font-landing-mono text-sm">
        <span className="text-starlight/45">zua/pay/</span>
        <span className="text-starlight">dinar</span>
        <span className="ml-0.5 h-4 w-px bg-violet motion-safe:animate-pulse" />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-(--signal-ink)">
        <Check className="size-3.5" aria-hidden="true" /> Available
      </p>
      <MockButton decorative className="mt-5">
        Claim @dinar
      </MockButton>
      <div className="mt-4 flex items-center gap-2.5 border border-starlight/10 px-3.5 py-3 text-sm">
        <Fingerprint
          className="size-4 text-(--signal-ink)"
          aria-hidden="true"
        />
        <span className="text-starlight/75">
          Keys derived from your passkey or PIN
        </span>
      </div>
    </MockWindow>
  );
}

function PayMock() {
  return (
    <MockWindow title="zua/pay/dinar/logo">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-starlight/55">Pay @dinar</p>
          <p className="mt-1 text-3xl font-normal">0.80 ZEC</p>
          <p className="mt-1 text-sm text-starlight/55">Logo design</p>
        </div>
        <div className="border border-starlight/10 bg-white p-2">
          <FauxQr />
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        <MockRow
          label="Paying from"
          value={
            <>
              <Wallet className="size-3.5" aria-hidden="true" /> Any Zcash
              wallet
            </>
          }
        />
        <MockRow
          accent
          label="Address"
          value={
            <>
              <BadgeCheck
                className="size-3.5 text-(--signal-ink)"
                aria-hidden="true"
              />{" "}
              Signed by @dinar
            </>
          }
        />
      </div>
      <MockButton decorative className="mt-5">
        Open in wallet
      </MockButton>
    </MockWindow>
  );
}

function DetectMock() {
  const lines = [
    ["sync", "blocks 3,141,560 → 3,141,592"],
    ["found", "0.80 ZEC · memo zua:inv:Q7xK2…"],
    ["match", "INV-0042 → paid"],
  ];
  return (
    <MockWindow title="zua · your browser">
      <ol className="grid list-none gap-2 font-landing-mono text-xs">
        {lines.map(([tag, text], i) => (
          <li
            key={tag}
            className="flex gap-3 border border-starlight/10 bg-void px-3 py-2.5 motion-safe:animate-[mock-in_400ms_ease-out_both]"
            style={{ animationDelay: `${i * 350}ms` }}
          >
            <span className="w-12 shrink-0 text-(--signal-ink)">{tag}</span>
            <span className="min-w-0 truncate">{text}</span>
          </li>
        ))}
      </ol>
      <div
        className="mt-5 flex items-center gap-4 border border-violet/50 bg-violet/10 p-4 motion-safe:animate-[mock-in_400ms_ease-out_both]"
        style={{ animationDelay: "1100ms" }}
      >
        <Mascot mood="success" size={48} tone="ink" />
        <div>
          <p className="text-sm">Invoice INV-0042 paid</p>
          <p className="mt-0.5 text-xs text-starlight/55">
            +0.80 ZEC · Northwind Studio
          </p>
        </div>
      </div>
      <p className="mt-4 text-center font-landing-mono text-[11px] uppercase tracking-[0.18em] text-starlight/50">
        Decrypted on this device only
      </p>
    </MockWindow>
  );
}

function SpendMock() {
  return (
    <MockWindow title="zua · Send">
      <p className="text-sm text-starlight/55">Shielded balance</p>
      <p className="mt-1 text-3xl font-normal">
        5.14 <span className="text-base text-starlight/60">ZEC</span>
      </p>
      <div className="mt-4 grid gap-2">
        <MockRow label="To" value="@studio_rent" />
        <MockRow label="Amount" value="1.50 ZEC" />
        <MockRow label="Note (encrypted)" value="November studio" />
        <MockRow
          accent
          label="Proof built in your browser"
          value={
            <>
              <Check
                className="size-3.5 text-(--signal-ink)"
                aria-hidden="true"
              />{" "}
              Ready
            </>
          }
        />
      </div>
      <p className="mt-4 text-center font-landing-mono text-[11px] uppercase tracking-[0.18em] text-starlight/50">
        Sender, recipient and amount stay private
      </p>
    </MockWindow>
  );
}
