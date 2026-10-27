"use client";

import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { nextTabIndex } from "./hooks";
import {
  Frame,
  MonoLabel,
  panel,
  SectionIntro,
  segmentButton,
  segmentGroup,
} from "./primitives";

type Payment = {
  block: number;
  payer: string;
  amount: string;
  memo: string;
};

// Five payments to one designer, as each audience would see them.
const PAYMENTS: Payment[] = [
  { block: 3141592, payer: "t1Yb8…qP3", amount: "0.80", memo: "Logo design" },
  { block: 3141640, payer: "t1Mn2…7Lw", amount: "0.35", memo: "Brand audit" },
  { block: 3141711, payer: "t1Yb8…qP3", amount: "1.20", memo: "Retainer" },
  { block: 3141756, payer: "t1Rc4…a9D", amount: "0.02", memo: "Tip" },
  { block: 3141802, payer: "t1Gh7…m2K", amount: "0.12", memo: "order_1042" },
];
const PAYEE = "t1Kop…9sN";
const TOTAL = "2.49";

// Stand-ins for ciphertext: shielded outputs carry encrypted note data.
const CIPHER = [
  "9f3a…c41e",
  "e07b…5d92",
  "41cc…0b7a",
  "b8d2…e613",
  "2a6f…93c0",
];

const VIEWS = [
  {
    id: "transparent",
    label: "Transparent chain",
    icon: Eye,
    headline: "Anyone can add up your business.",
    learns: [
      "You earned 2.49 ZEC across five payments.",
      "Your biggest client paid you twice (t1Yb8…qP3).",
      "Every future payment to your address shows up too.",
    ],
    note: "Transparent Zcash works like Bitcoin: sender, recipient and amount are public forever.",
  },
  {
    id: "shielded",
    label: "Zcash, shielded",
    icon: EyeOff,
    headline: "Observers see that something happened.",
    learns: [
      "Five transactions, in these blocks.",
      "Each one paid a network fee.",
      "Not who paid, who was paid, how much, or why.",
    ],
    note: "Zua only uses the shielded pool: amounts, addresses and memos are encrypted on chain.",
  },
  {
    id: "you",
    label: "Your wallet",
    icon: KeyRound,
    headline: "Only your keys can read it.",
    learns: [
      "Every amount and memo, decrypted in your browser.",
      "Which invoice or sale each payment settles.",
      "Not even you see the payer's address, only what they wrote.",
    ],
    note: "Zua's server never gets these keys, so it can't read your payments either.",
  },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

function Sealed({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-landing-mono text-xs text-starlight/60">
      <Lock className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}

function cells(view: ViewId, p: Payment, i: number): ReactNode[] {
  if (view === "transparent")
    return [
      <span key="from" className="font-landing-mono text-xs">
        {p.payer}
      </span>,
      <span key="to" className="font-landing-mono text-xs">
        {PAYEE}
      </span>,
      <span key="amt" className="tabular-nums">
        {p.amount} ZEC
      </span>,
      <span key="memo" className="text-starlight/60">
        no memo
      </span>,
    ];
  if (view === "shielded")
    return [
      <Sealed key="from">shielded</Sealed>,
      <Sealed key="to">shielded</Sealed>,
      <Sealed key="amt">{CIPHER[i]}</Sealed>,
      <Sealed key="memo">encrypted</Sealed>,
    ];
  return [
    <span key="from" className="text-starlight/60">
      not revealed
    </span>,
    <span key="to">You</span>,
    <span key="amt" className="tabular-nums text-(--signal-ink)">
      +{p.amount} ZEC
    </span>,
    <span key="memo">“{p.memo}”</span>,
  ];
}

const COLUMNS = ["Block", "From", "To", "Amount", "Memo"];

export function Exposure() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const view = VIEWS[active];

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextTabIndex(event.key, i, VIEWS.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section
      id="privacy"
      data-ed-section
      aria-labelledby="privacy-title"
      className="relative py-24 sm:py-32"
    >
      <Frame>
        <SectionIntro
          label="Privacy, shown"
          titleId="privacy-title"
          title="Same five payments. Three ways to look at them."
        >
          A payment address is a public record on most blockchains. Switch the
          view to see what a stranger, the Zcash network and you can each learn
          from one week of income.
        </SectionIntro>

        <div
          role="tablist"
          aria-label="Who is looking"
          className={cn(segmentGroup, "mt-12")}
        >
          {VIEWS.map(({ id, label, icon: Icon }, i) => (
            <button
              key={id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`privacy-tab-${id}`}
              aria-selected={i === active}
              aria-controls="privacy-panel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(event) => onKeyDown(event, i)}
              className={segmentButton}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div
          id="privacy-panel"
          role="tabpanel"
          aria-labelledby={`privacy-tab-${view.id}`}
          className={cn(panel, "mt-4 grid lg:grid-cols-[minmax(0,1fr)_340px]")}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Five payments as seen from: {view.label}
              </caption>
              <thead>
                <tr className="border-b border-starlight/10">
                  {COLUMNS.map((c) => (
                    <th key={c} scope="col" className="px-5 py-3.5 font-normal">
                      <MonoLabel className="text-[11px] text-starlight/50">
                        {c}
                      </MonoLabel>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody key={view.id}>
                {PAYMENTS.map((p, i) => (
                  <tr
                    key={p.block}
                    className="border-b border-starlight/10 last:border-b-0 motion-safe:animate-[mock-in_400ms_ease-out_both]"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <td className="px-5 py-4 font-landing-mono text-xs text-starlight/60 tabular-nums">
                      {p.block.toLocaleString("en-US")}
                    </td>
                    {cells(view.id, p, i).map((cell, c) => (
                      <td key={COLUMNS[c + 1]} className="px-5 py-4">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-starlight/10">
                  <th
                    scope="row"
                    colSpan={3}
                    className="px-5 py-4 text-left font-normal"
                  >
                    <MonoLabel className="text-[11px] text-starlight/50">
                      Total received
                    </MonoLabel>
                  </th>
                  <td className="px-5 py-4">
                    {view.id === "shielded" ? (
                      <Sealed>can&rsquo;t be summed</Sealed>
                    ) : (
                      <span
                        className={cn(
                          "tabular-nums",
                          view.id === "you" && "text-(--signal-ink)",
                        )}
                      >
                        {TOTAL} ZEC
                      </span>
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <aside className="border-t border-starlight/10 p-6 lg:border-t-0 lg:border-l sm:p-8">
            <MonoLabel className="text-[11px] text-starlight/50">
              What this view learns
            </MonoLabel>
            <p className="mt-3 text-xl leading-snug tracking-tight">
              {view.headline}
            </p>
            <ul className="mt-5 grid list-none gap-3">
              {view.learns.map((line) => (
                <li
                  key={line}
                  className="flex gap-3 text-[15px] leading-relaxed text-starlight/75"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-violet"
                  />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-starlight/10 pt-5 text-sm leading-relaxed text-starlight/55">
              {view.note}
            </p>
          </aside>
        </div>
      </Frame>
    </section>
  );
}
