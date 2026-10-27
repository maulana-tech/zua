"use client";

import Link from "next/link";
import { useWallet } from "../WalletProvider";
import { Frame, pillOutlineLight, pillSolidViolet } from "./primitives";

const POINTS = ["No Zua fee", "No seed phrase", "Any Zcash wallet can pay"];

export function FinalCta() {
  const { authenticated, signIn } = useWallet();
  return (
    <section
      aria-labelledby="cta-title"
      className="relative isolate overflow-hidden text-graphite"
    >
      <Frame className="flex min-h-[78svh] flex-col justify-center py-24">
        <h2
          id="cta-title"
          className="text-[clamp(4rem,13vw,11rem)] font-normal leading-[0.9] tracking-[-0.04em]"
        >
          Zua
        </h2>
        <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-graphite/85 sm:text-xl">
          Shielded ZEC payment links, invoices and checkout. Claim your
          @username in under a minute.
        </p>
        <ul className="mt-8 flex list-none flex-wrap gap-x-8 gap-y-3 text-[15px] text-graphite/75">
          {POINTS.map((point) => (
            <li key={point} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-violet"
              />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
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
          <a href="/verify" className={pillOutlineLight}>
            Verify a receipt
          </a>
        </div>
      </Frame>
    </section>
  );
}
