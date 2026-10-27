"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Frame, MonoLabel, panel, SectionIntro } from "./primitives";

type Knows = "yes" | "partly" | "no";

const FACTS = [
  "Amount",
  "Who paid",
  "Memo",
  "Your other payments",
  "Your balance",
] as const;

const PARTIES: {
  name: string;
  knows: [Knows, Knows, Knows, Knows, Knows];
  detail: string;
}[] = [
  {
    name: "Anyone with a block explorer",
    knows: ["no", "no", "no", "no", "no"],
    detail:
      "Sees that a shielded transaction happened, in which block, and the fee it paid. Amounts, addresses and memos are encrypted on chain.",
  },
  {
    name: "Zua's server",
    knows: ["partly", "no", "no", "no", "no"],
    detail:
      "Stores your username, public addresses, and the invoices, links and checkouts you create, so it knows what you asked for. It learns one is paid only when your wallet reports it, never the transaction that paid it. It holds no viewing key, so it can't scan the chain for you.",
  },
  {
    name: "Your client, the payer",
    knows: ["yes", "yes", "yes", "no", "no"],
    detail:
      "Knows what they paid and what they wrote, because they sent it. Every invoice, link and checkout uses its own address, so they can't connect you to payments from anyone else.",
  },
  {
    name: "You",
    knows: ["yes", "partly", "yes", "yes", "yes"],
    detail:
      "Your wallet decrypts everything sent to you, in your browser. Payers stay anonymous even to you unless they say who they are in the memo.",
  },
  {
    name: "Your accountant, with a receipt",
    knows: ["partly", "no", "partly", "no", "no"],
    detail:
      "Can verify exactly the payments listed in the receipt or statement you hand over, against the chain. Nothing else: no viewing key, no balance, no other payment.",
  },
];

const LABEL: Record<Knows, string> = {
  yes: "Knows",
  partly: "Partly",
  no: "Can't see",
};

function Mark({ knows }: { knows: Knows }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "relative size-3.5 shrink-0 overflow-hidden rounded-full border",
          knows === "no"
            ? "border-starlight/25"
            : "border-(--signal-ink) bg-transparent",
        )}
      >
        {knows !== "no" ? (
          <span
            className={cn(
              "absolute inset-y-0 left-0 bg-violet",
              knows === "yes" ? "w-full" : "w-1/2",
            )}
          />
        ) : null}
      </span>
      <span
        className={cn(
          "text-xs",
          knows === "no" ? "text-starlight/60" : "text-starlight/75",
        )}
      >
        {LABEL[knows]}
      </span>
    </span>
  );
}

export function TrustModel() {
  const [active, setActive] = useState(1);
  const party = PARTIES[active];

  return (
    <section
      id="trust"
      data-ed-section
      aria-labelledby="trust-title"
      className="relative py-24 sm:py-32"
    >
      <Frame>
        <SectionIntro
          label="Who learns what"
          titleId="trust-title"
          title="No one sees the whole picture. Including us."
        >
          Privacy is only as good as its weakest observer. Here is what each
          party can learn about a payment to you. Pick a row for the details.
        </SectionIntro>

        <div className={cn(panel, "mt-14")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <caption className="sr-only">
                What each party can learn about a payment made to you
              </caption>
              <thead>
                <tr className="border-b border-starlight/10">
                  <th scope="col" className="px-5 py-3.5 font-normal">
                    <MonoLabel className="text-[11px] text-starlight/50">
                      Who
                    </MonoLabel>
                  </th>
                  {FACTS.map((fact) => (
                    <th
                      key={fact}
                      scope="col"
                      className="px-4 py-3.5 font-normal"
                    >
                      <MonoLabel className="text-[11px] text-starlight/50">
                        {fact}
                      </MonoLabel>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PARTIES.map((p, i) => {
                  const selected = i === active;
                  return (
                    <tr
                      key={p.name}
                      className={cn(
                        "border-b border-starlight/10 transition-colors last:border-b-0",
                        selected ? "bg-violet/10" : "hover:bg-starlight/[0.03]",
                      )}
                    >
                      <th scope="row" className="p-0 font-normal">
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-controls="trust-detail"
                          onClick={() => setActive(i)}
                          className="flex min-h-14 w-full items-center gap-3 px-5 text-left text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-5 w-0.5 shrink-0 transition-colors",
                              selected ? "bg-violet" : "bg-transparent",
                            )}
                          />
                          {p.name}
                        </button>
                      </th>
                      {p.knows.map((k, c) => (
                        <td key={FACTS[c]} className="px-4 py-3">
                          <Mark knows={k} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            id="trust-detail"
            aria-live="polite"
            className="grid gap-3 border-t border-starlight/10 p-6 sm:grid-cols-[260px_minmax(0,1fr)] sm:p-8"
          >
            <p className="text-xl leading-snug tracking-tight">{party.name}</p>
            <p className="max-w-[70ch] text-[15px] leading-relaxed text-starlight/75">
              {party.detail}
            </p>
          </div>
        </div>
      </Frame>
    </section>
  );
}
