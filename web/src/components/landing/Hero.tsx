"use client";

import Link from "next/link";
import { useWallet } from "../WalletProvider";
import { LiveLedger } from "./LiveLedger";
import {
  Frame,
  MonoLabel,
  pillOutlineDark,
  pillSolidViolet,
} from "./primitives";

// Product facts only — no vanity metrics.
const FACTS = [
  { value: "Halo 2", label: "Proofs built on your device" },
  { value: "0 seed", label: "Phrases to write down" },
  { value: "1 address", label: "Per invoice, link and checkout" },
  { value: "100%", label: "Self-custodial" },
] as const;

export function Hero() {
  const { authenticated, signIn } = useWallet();

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden"
    >
      <Frame className="flex min-h-[92svh] flex-col justify-end pt-28 pb-14 sm:pb-20">
        <div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_400px] xl:gap-20">
          <div className="max-w-3xl">
            <h1
              id="hero-title"
              className="text-[clamp(2.6rem,6.2vw,5.4rem)] font-normal leading-[1.02] tracking-[-0.02em]"
            >
              Get paid in ZEC.
              <br />
              Keep your income private.
            </h1>
            <p className="mt-7 max-w-[56ch] text-base leading-relaxed text-starlight/80 sm:text-lg">
              Payment links, invoices, a point of sale and payroll, all on
              shielded Zcash. Clients pay from any Zcash wallet, and the money
              lands in a balance only you can see. Your wallet runs in your
              browser, so Zua never sees who paid you or how much.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              {authenticated ? (
                <Link href="/dashboard" className={pillSolidViolet}>
                  Open your dashboard
                </Link>
              ) : (
                <button
                  type="button"
                  className={pillSolidViolet}
                  onClick={() => signIn()}
                >
                  Create your payment link
                </button>
              )}
              <a href="#how" className={pillOutlineDark}>
                See how it works
              </a>
            </div>
          </div>

          <div className="w-full max-w-[440px] lg:max-w-none">
            <LiveLedger />
          </div>
        </div>
      </Frame>

      <Frame>
        <dl className="grid grid-cols-2 border-y border-starlight/10 bg-void-2 lg:grid-cols-4">
          {FACTS.map((fact, index) => (
            <div
              key={fact.label}
              className={`flex flex-col-reverse gap-3 py-10 pr-4 sm:py-14 ${
                index % 2 === 1
                  ? "border-l border-starlight/10 pl-4 sm:pl-8"
                  : ""
              } ${index >= 2 ? "border-t border-starlight/10 lg:border-t-0" : ""} ${
                index === 2 ? "lg:border-l lg:pl-8" : ""
              }`}
            >
              <dt>
                <MonoLabel className="text-starlight/65">
                  {fact.label}
                </MonoLabel>
              </dt>
              <dd className="text-[clamp(2.2rem,4.2vw,3.6rem)] font-normal leading-none tracking-tight">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </Frame>
    </section>
  );
}
