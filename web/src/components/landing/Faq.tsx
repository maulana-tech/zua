"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Frame, MonoLabel, segmentButton, segmentGroup } from "./primitives";

type Topic = "Payments" | "Privacy" | "Account";

const TOPICS: (Topic | "All")[] = ["All", "Payments", "Privacy", "Account"];

const FAQ_ITEMS: { topic: Topic; question: string; answer: string }[] = [
  {
    topic: "Payments",
    question: "Do my clients need to use Zua?",
    answer:
      "No. They open your link or invoice and scan the QR code with any shielded Zcash wallet, like Zodl. They don't need an account.",
  },
  {
    topic: "Payments",
    question: "What does it cost?",
    answer:
      "Zua adds no fee. Each payment pays the Zcash network fee, 0.0001 ZEC for a simple payment under ZIP-317, from the payer's wallet. A payroll to many people costs a little more per recipient, and you see the exact fee before you confirm.",
  },
  {
    topic: "Payments",
    question: "How fast does an invoice turn paid?",
    answer:
      "Usually within a couple of minutes. Once the payment is in a block (about 75 seconds on average), your wallet finds it on its next sync, every few seconds while a payment screen is open. The ZEC is spendable after 3 confirmations.",
  },
  {
    topic: "Payments",
    question: "Can I price in dollars?",
    answer:
      "Yes. Invoices and checkouts can be priced in USD and the point of sale in 24 currencies. The payer always pays ZEC, at a rate locked for 30 minutes once they open it.",
  },
  {
    topic: "Privacy",
    question: "What stays private?",
    answer:
      "Who paid you, how much, and your whole payment history. Shielded Zcash transactions encrypt the sender, recipient, amount and memo, so only your keys can read them. If you cash out to a transparent address (for example an exchange), that one payment becomes public.",
  },
  {
    topic: "Privacy",
    question: "Can Zua see my payments?",
    answer:
      "No. Zua's server never sees shielded transactions and holds no viewing key. It knows what you asked for, like an invoice for an amount, and learns it was paid only when your wallet reports it.",
  },
  {
    topic: "Privacy",
    question: "Can I still prove I received a payment?",
    answer:
      "Yes. Make a receipt for a payment you received, a proof of payment for one you sent, or an income statement for a period. Anyone can check it on /verify, which decrypts just those payments from the chain and nothing else.",
  },
  {
    topic: "Privacy",
    question: "How is Zua different from a crypto mixer?",
    answer:
      "Zua is not a mixer. It uses Zcash's built-in shielded pool, the same privacy every Zcash wallet has, and adds what a business needs on top: usernames, payment links, invoices and receipts.",
  },
  {
    topic: "Privacy",
    question: "Why not just use a new wallet for every payment?",
    answer:
      "It gets unmanageable fast, and moving funds between those wallets still reveals the pattern on a public blockchain. Zua gives you one link and one balance, with privacy built in.",
  },
  {
    topic: "Privacy",
    question: "Why Zcash?",
    answer:
      "Zcash has the most battle-tested shielded payments: zero-knowledge proofs (Halo 2, no trusted setup) hide every detail of a payment, and wallets like Zodl already speak the same payment-request format Zua uses.",
  },
  {
    topic: "Account",
    question: "Does Zua hold my money?",
    answer:
      "No. Your wallet's key is made in your browser and payments go straight to addresses only you control. Zua can't move or spend your funds, and you can open the same wallet in any Zcash wallet with your 24 words.",
  },
  {
    topic: "Account",
    question: "Do I need to write down a seed phrase?",
    answer:
      "No. Your wallet is rebuilt in the browser from a passkey or a 6-digit PIN each time you sign in. A passkey leaves nothing secret with us; with a PIN, Zua keeps an encrypted copy of your key that only your PIN unlocks.",
  },
  {
    topic: "Account",
    question: "What happens if I lose my phone or laptop?",
    answer:
      "Sign in on a new device and unlock with the same synced passkey or your PIN; your wallet syncs back from the blockchain. You can also export your 24 words to any Zcash wallet as a backup.",
  },
];

export function Faq() {
  const [openItems, setOpenItems] = useState<Set<string>>(() => new Set());
  const [topic, setTopic] = useState<Topic | "All">("All");
  const items =
    topic === "All"
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter((item) => item.topic === topic);

  const toggleItem = (question: string) => {
    setOpenItems((current) => {
      const next = new Set(current);
      if (next.has(question)) next.delete(question);
      else next.add(question);
      return next;
    });
  };

  return (
    <section
      id="faq"
      data-ed-section
      aria-labelledby="faq-title"
      className="relative py-24 sm:py-32"
    >
      <Frame>
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <div>
            <MonoLabel className="text-starlight/60">FAQ</MonoLabel>
            <h2
              id="faq-title"
              className="mt-4 text-[clamp(1.9rem,2.8vw,2.6rem)] font-normal tracking-tight"
            >
              Questions, answered
            </h2>
            <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-starlight/60">
              Privacy should feel practical, not mysterious. These come up
              first.
            </p>
            <fieldset className={cn(segmentGroup, "mt-8")}>
              <legend className="sr-only">Filter questions by topic</legend>
              {TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={topic === t}
                  onClick={() => setTopic(t)}
                  className={segmentButton}
                >
                  {t}
                </button>
              ))}
            </fieldset>
          </div>

          <div className="border-t border-starlight/10">
            {items.map((item) => {
              const isOpen = openItems.has(item.question);
              const answerId = `faq-answer-${item.question
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`;

              return (
                <div
                  className="group border-b border-starlight/10"
                  data-open={isOpen}
                  key={item.question}
                >
                  <button
                    type="button"
                    className="flex min-h-[72px] w-full cursor-pointer items-center justify-between gap-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => toggleItem(item.question)}
                  >
                    <span className="text-lg font-normal tracking-tight text-starlight sm:text-xl">
                      {item.question}
                    </span>
                    <span
                      className="relative grid size-10 shrink-0 place-items-center rounded-full border border-starlight/25 text-starlight transition-colors group-data-[open=true]:border-violet group-data-[open=true]:bg-violet"
                      aria-hidden="true"
                    >
                      <span className="absolute h-px w-4 bg-current" />
                      <span className="absolute h-4 w-px bg-current transition-[opacity,transform] duration-200 group-data-[open=true]:rotate-90 group-data-[open=true]:opacity-0" />
                    </span>
                  </button>
                  <div
                    aria-hidden={!isOpen}
                    className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-300 ease-out data-[open=true]:grid-rows-[1fr] data-[open=true]:opacity-100 motion-reduce:transition-none"
                    data-open={isOpen}
                    id={answerId}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <p className="max-w-[68ch] pb-7 pr-14 text-[15px] leading-relaxed text-starlight/65">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Frame>
    </section>
  );
}
