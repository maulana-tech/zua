import { Loupe, Padlock, Relay, Vault } from "@lucasmarkes/hairline/react";
import { Frame } from "./primitives";

const REASONS = [
  {
    title: "Private by default",
    body: "Every payment is a shielded Zcash transaction. The blockchain records that something happened, not who paid whom or how much.",
    Figure: Vault,
  },
  {
    title: "Provable when it matters",
    body: "Hand your accountant a signed receipt, proof of payment or income statement. Anyone can check it on /verify against the chain, without seeing the rest of your history.",
    Figure: Loupe,
  },
  {
    title: "Your passkey or PIN is the key",
    body: "Your Zcash wallet is rebuilt in the browser on each device, from your passkey or a 6-digit PIN. No seed phrase to write down. With a PIN, we keep only an encrypted copy of your key that your PIN unlocks.",
    Figure: Padlock,
  },
  {
    title: "Works with any Zcash wallet",
    body: "Payment links and invoices use the standard Zcash payment-request format, so clients pay with Zodl or any wallet they already have.",
    Figure: Relay,
  },
] as const;

export function Solution() {
  return (
    <section
      id="why"
      data-ed-section
      aria-labelledby="why-title"
      className="relative"
    >
      <Frame>
        <div className="grid border-t border-starlight/10 lg:grid-cols-[1fr_2fr]">
          <div className="py-14 lg:border-r lg:border-starlight/10 lg:py-24 lg:pr-10">
            <h2
              id="why-title"
              className="text-[clamp(1.9rem,2.8vw,2.6rem)] font-normal tracking-tight lg:sticky lg:top-28"
            >
              Why Zua
            </h2>
          </div>
          <div>
            {REASONS.map(({ Figure, ...reason }, index) => (
              <article
                key={reason.title}
                data-ed-article
                className={`grid items-center gap-10 py-14 md:grid-cols-[1fr_1.1fr] lg:pl-10 lg:py-20 ${
                  index > 0
                    ? "border-t border-starlight/10"
                    : "border-t border-starlight/10 lg:border-t-0"
                }`}
              >
                <div>
                  <h3 className="text-[clamp(1.5rem,2.2vw,2rem)] font-normal leading-tight tracking-tight">
                    {reason.title}
                  </h3>
                  <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-starlight/65">
                    {reason.body}
                  </p>
                </div>
                {/* Hairline figures answer the pointer; `play` loops a demo
                    until someone hovers or focuses them. */}
                <Figure
                  theme="light"
                  play
                  intensity={1}
                  label={`${reason.title} illustration`}
                  className="hairline-figure mx-auto w-full max-w-[420px]"
                />
              </article>
            ))}
          </div>
        </div>
      </Frame>
    </section>
  );
}
