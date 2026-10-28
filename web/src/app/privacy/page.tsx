import { ChevronLeft, Mail } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Zua",
  description:
    "What Zua stores, what stays in your browser, and which providers process data for shielded Zcash payments.",
};

const SECTIONS = [
  ["who-we-are", "Who we are"],
  ["summary", "Summary"],
  ["keys-and-your-browser", "Keys and your browser"],
  ["what-we-store", "What we store"],
  ["payment-privacy", "Payment privacy"],
  ["service-providers", "Service providers"],
  ["retention-and-deletion", "Retention and deletion"],
  ["your-rights", "Your rights"],
  ["security-and-limits", "Security and limits"],
  ["changes-and-contact", "Changes and contact"],
] as const;

const storageRows = [
  [
    "Account",
    "Privy user ID, email address or Google account, username, account type, business name",
    "Sign-in, your public profile, and the tools enabled for your account",
  ],
  [
    "Payment identities",
    "Unified addresses and the Orchard receiver of each address you publish or invoice with",
    "Matching an incoming payment to its invoice, request, or payment link",
  ],
  [
    "Payment records",
    "Invoices, payment links, requests, claim links, checkouts, amounts, references, status, transaction IDs, and the contacts you choose to save",
    "Showing your history, settling records, and telling payers what is still due",
  ],
  [
    "Developer integrations",
    "API key hashes, webhook URLs, webhook signing secrets, and webhook delivery logs",
    "Authenticating your API calls and retrying webhook deliveries",
  ],
  [
    "Notifications",
    "Notification preferences and a log of what was sent",
    "Avoiding duplicate emails and honouring your choices",
  ],
] as const;

const localRows = [
  [
    "Wallet keys",
    "Your mnemonic is derived from your PIN or passkey on your device. It is never sent to Zua.",
  ],
  [
    "Wallet database",
    "A copy of your wallet database is cached in your browser storage so the next unlock is faster. It is encrypted with a key derived from your PIN or passkey, and it is cleared when you sign out.",
  ],
  [
    "Memos",
    "Payment memos are decrypted in your browser and cached only there, so invoices and cashier screens can show them again.",
  ],
  [
    "Receipts",
    "Receipt files are generated and stored on your device. Zua keeps the record of the payment, not a copy of the file.",
  ],
] as const;

const providerRows = [
  [
    "Privy",
    "Sign-in by email one-time code, Google, or passkey. Receives your email or Google account and issues the session token that Zua verifies.",
  ],
  [
    "MongoDB Atlas",
    "Database hosting for the account and payment records listed above.",
  ],
  [
    "Vercel",
    "Hosting for the web app and its API routes, including request logs kept by the platform.",
  ],
  [
    "ChainSafe lightwalletd proxy",
    "Your browser fetches Zcash compact blocks from this public gRPC-web proxy. It can see your IP address and the blocks you request, as any node you connect to can. It never sees your keys.",
  ],
  [
    "Resend",
    "Only if email notifications are enabled: receives the recipient address and the message content.",
  ],
  [
    "Merchant webhooks",
    "Only for developers who register a webhook: checkout events are delivered to the URL that developer controls.",
  ],
] as const;

export default function PrivacyPage() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <header className="bg-brand-obsidian text-brand-linen">
        <nav
          aria-label="Privacy policy navigation"
          className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-(--dashboard-gutter) py-5 sm:py-6 lg:py-7"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-linen/12 text-brand-linen ring-1 ring-brand-linen/20 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-linen"
              aria-label="Back to dashboard"
              title="Back to dashboard"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
            <span
              className="truncate font-heading text-lg font-semibold text-brand-linen"
              aria-current="page"
            >
              Privacy Policy
            </span>
          </div>
          <Link
            href="/"
            aria-label="Zua home"
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-linen"
          >
            <Image
              src="/assets/zua-white.svg"
              alt=""
              width={72}
              height={72}
              className="size-16 sm:size-[4.5rem]"
              priority
            />
          </Link>
        </nav>
      </header>

      <main id="main-content">
        <section className="border-b border-line text-olive-deep">
          <div className="mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:px-10 lg:pb-24">
            <h1 className="mt-4 max-w-4xl font-heading text-4xl font-bold tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              Privacy Policy
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-olive-deep sm:text-lg">
              What Zua stores on its servers, what never leaves your browser,
              and who else processes data so that shielded payments can work.
            </p>
            <dl className="mt-10 flex flex-col gap-4 border-t border-line pt-6 text-sm sm:flex-row sm:gap-12">
              <div>
                <dt className="text-olive/70">Effective date</dt>
                <dd className="mt-1 font-semibold">October 28, 2026</dd>
              </div>
              <div>
                <dt className="text-olive/70">Last updated</dt>
                <dd className="mt-1 font-semibold">October 28, 2026</dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-10 lg:py-20">
          <aside className="hidden lg:block">
            <nav
              aria-label="Privacy policy sections"
              className="sticky top-8 border-l border-line pl-5"
            >
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-ink/60">
                On this page
              </p>
              <ol className="space-y-2.5 text-sm leading-5">
                {SECTIONS.map(([id, label], index) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="group flex gap-2 text-ink/60 transition-colors duration-150 hover:text-olive-deep"
                    >
                      <span className="w-5 shrink-0 tabular-nums text-olive/70">
                        {index + 1}.
                      </span>
                      <span>{label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="min-w-0 max-w-3xl">
            <PolicySection number={1} id="who-we-are" title="Who we are">
              <p>
                Zua is a shielded payment app for Zcash, operated by{" "}
                <strong>PT Pentahelix Sistem Terpercaya</strong>{" "}
                (&quot;Zua,&quot; &quot;we,&quot; &quot;us&quot;). This policy
                covers the Zua web app, its API for developers, and the public
                pages that payers open, such as invoices, payment links, and
                checkout pages.
              </p>
              <p>
                The source code is open source. You can read exactly what the
                app does instead of taking this document on trust.
              </p>
            </PolicySection>

            <PolicySection number={2} id="summary" title="Summary">
              <ul>
                <li>
                  <strong>Your keys never reach us.</strong> The mnemonic that
                  controls your funds is derived on your device from your PIN or
                  passkey, and it is never transmitted to Zua.
                </li>
                <li>
                  <strong>We store account and payment metadata</strong>, not
                  your spending keys: who you are on Zua, which invoices and
                  links you created, and which payments settled them.
                </li>
                <li>
                  <strong>No advertising, no analytics, no trackers.</strong>{" "}
                  The app ships no third-party analytics, advertising, or
                  session recording scripts.
                </li>
                <li>
                  <strong>No identity verification.</strong> Zua does not ask
                  for identity documents. A verified badge means a username or
                  receipt signature was checked against a public key, not that
                  we confirmed who a person is.
                </li>
                <li>
                  <strong>Payments are public at the network level.</strong>{" "}
                  Shielded transactions hide amounts and addresses, but the fact
                  that a transaction exists, and when, is visible on the Zcash
                  blockchain.
                </li>
              </ul>
            </PolicySection>

            <PolicySection
              number={3}
              id="keys-and-your-browser"
              title="Keys and your browser"
            >
              <p>
                Zua runs the Zcash wallet inside your browser, compiled to
                WebAssembly. Your device derives the wallet keys, scans compact
                blocks, decrypts your notes, and builds the zero-knowledge
                proofs for spending. Our servers coordinate accounts, invoices,
                and statuses; they do not hold the keys needed to move funds.
              </p>
              <Subsection title="What stays on your device">
                <PolicyTable
                  headers={["Item", "Where it lives"]}
                  rows={localRows.map((row) => [row[0], row[1]])}
                />
              </Subsection>
              <Subsection title="Why we cannot recover your funds">
                <p>
                  Because the keys are derived from your PIN or passkey, we
                  cannot reset them, and we cannot restore access to a balance
                  for you. If you lose both your PIN and your passkey, the funds
                  in that account stay where they are. Keep the recovery method
                  you chose available.
                </p>
              </Subsection>
            </PolicySection>

            <PolicySection number={4} id="what-we-store" title="What we store">
              <p>
                Everything below is stored on our servers so the product can
                work across devices and so payers can see what they owe.
              </p>
              <PolicyTable
                headers={["Category", "Examples", "Why"]}
                rows={storageRows}
              />
              <Subsection title="Public profiles">
                <p>
                  A username and, for business accounts, a business name are
                  public. They appear when someone opens your payment link,
                  invoice, or claim link, and they are used to resolve
                  &quot;send to @username&quot; payments before a transfer is
                  built.
                </p>
              </Subsection>
              <Subsection title="Receipts and payment disclosure">
                <p>
                  A receipt is a signed statement about a payment. Whoever holds
                  the file can use it to reveal the outputs it lists, including
                  amounts. Share receipts the way you would share a bank
                  statement, not the way you would share a link.
                </p>
              </Subsection>
              <Subsection title="Developer data">
                <p>
                  If you create an API key, we store a hash of it and never the
                  key itself. Webhook signing secrets are stored so that
                  deliveries can be signed. Webhook payloads include the
                  checkout data you sent us, so avoid putting personal data in
                  descriptions that do not need it.
                </p>
              </Subsection>
            </PolicySection>

            <PolicySection
              number={5}
              id="payment-privacy"
              title="Payment privacy"
            >
              <p>
                Zcash shielded transactions keep amounts, addresses, and memos
                out of public view. Zua only accepts shielded addresses, so a
                payment through Zua does not publish a balance or a recipient
                list on the blockchain. What remains public is that some
                transaction was mined, in which block, and its fee.
              </p>
              <p>
                Reading your own notes requires the wallet to fetch compact
                blocks. That traffic goes through a public lightwalletd proxy,
                which sees your IP address and the blocks you ask for, in the
                same way any node you connect to would. Zua is not the operator
                of that proxy.
              </p>
              <Subsection title="Memos">
                <p>
                  Zua uses memos to attach an invoice, request, or link
                  reference to a payment. Memos are decrypted in your browser.
                  Our servers see the reference when the payer reports the
                  payment, but not the full memo content of your other
                  transactions.
                </p>
              </Subsection>
            </PolicySection>

            <PolicySection
              number={6}
              id="service-providers"
              title="Service providers"
            >
              <p>
                We use a small number of providers. We do not sell personal data
                and we do not share it for advertising.
              </p>
              <PolicyTable
                headers={["Provider", "What it processes"]}
                rows={providerRows}
              />
              <p>
                Some providers process data outside Indonesia. Where the law
                requires it, we rely on appropriate safeguards for those
                transfers, and we limit what is sent to what the service needs.
              </p>
            </PolicySection>

            <PolicySection
              number={7}
              id="retention-and-deletion"
              title="Retention and deletion"
            >
              <p>
                Account and payment records are kept while your account exists,
                so your history and your payers&apos; receipts stay consistent.
                When you delete your account, we delete your profile, addresses,
                invoices, links, requests, claim links, API keys, and webhook
                settings from the active database, and remove them from backups
                as those backups rotate.
              </p>
              <p>
                Signing out clears the local wallet cache on that device. Data
                already written to the Zcash blockchain cannot be deleted by us
                or by anyone else.
              </p>
              <p>
                We may keep limited records longer where we must, for example to
                resolve a dispute, prevent abuse, or meet a legal obligation.
              </p>
            </PolicySection>

            <PolicySection number={8} id="your-rights" title="Your rights">
              <p>
                Subject to applicable law, including Indonesia&apos;s Personal
                Data Protection Law (Law No. 27 of 2022), you can ask us to:
              </p>
              <ul>
                <li>confirm what we hold about you and give you a copy;</li>
                <li>correct inaccurate account or profile data;</li>
                <li>delete your account and the records listed above;</li>
                <li>
                  export your payment history, which the app already provides as
                  CSV and as receipt files;
                </li>
                <li>
                  stop non-essential messages, such as email notifications.
                </li>
              </ul>
              <p>
                Write to the address in the last section. We may need to verify
                that the account is yours before acting. Because we do not hold
                your keys, we cannot act on requests about funds themselves.
              </p>
            </PolicySection>

            <PolicySection
              number={9}
              id="security-and-limits"
              title="Security and limits"
            >
              <p>
                Access to the app requires a Privy session. Your wallet requires
                your PIN or your passkey before keys are derived, and the local
                cache is encrypted with material derived from it. API keys are
                stored as hashes, and the API never accepts a key that does not
                match one on file.
              </p>
              <p>
                No system is perfect. A compromised device, a malicious browser
                extension, a shared computer left unlocked, or a weak PIN can
                defeat these controls. Use a device you trust, keep the browser
                updated, and prefer a passkey when your provider supports it.
              </p>
              <p>
                Zua is software, not a bank or a custodian. We do not hold your
                funds, we cannot freeze them, and we cannot reverse a payment
                that the network has confirmed.
              </p>
            </PolicySection>

            <PolicySection
              number={10}
              id="changes-and-contact"
              title="Changes and contact"
            >
              <p>
                We update this policy when the product or the law changes, and
                we revise the date at the top. Material changes are announced in
                the app before they take effect.
              </p>
              <p>Questions, requests, or complaints:</p>
              <address className="not-italic">
                <strong>Zua Privacy Team</strong>
                <br />
                PT Pentahelix Sistem Terpercaya
                <br />
                Jl. Pondok Kopi Raya No. 180, Pondok Kopi, Duren Sawit, East
                Jakarta, DKI Jakarta 13460, Indonesia
                <br />
                <a href="mailto:ptpentahelixsistemterpercaya@gmail.com">
                  ptpentahelixsistemterpercaya@gmail.com
                </a>
              </address>
              <p>
                You may also contact the data protection authority where the law
                gives you that right.
              </p>
            </PolicySection>

            <div className="mt-16 border-t border-line pt-8">
              <a
                href="mailto:ptpentahelixsistemterpercaya@gmail.com"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ed-dark bg-ed-dark px-3 text-center text-sm font-semibold tracking-[0.02em] !text-ed-cream transition-opacity hover:!text-ed-cream hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ed-dark focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:px-5"
              >
                <Mail className="size-4" aria-hidden="true" />
                Contact the privacy team
              </a>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function PolicySection({
  number,
  id,
  title,
  children,
}: {
  number: number;
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-8 border-t border-line py-10 first-of-type:mt-12 sm:py-12"
    >
      <div className="mb-6 flex items-start gap-4">
        <span className="mt-1 text-sm font-bold tabular-nums text-ink">
          {String(number).padStart(2, "0")}
        </span>
        <h2 className="font-heading text-2xl font-bold tracking-[-0.025em] text-ink sm:text-3xl">
          {title}
        </h2>
      </div>
      <div className="space-y-5 text-[0.97rem] leading-7 text-ink/80 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-olive/35 [&_a]:underline-offset-4 hover:[&_a]:decoration-olive-deep [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 pt-2">
      <h3 className="text-lg font-bold tracking-[-0.015em] text-ink">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PolicyTable({
  headers,
  rows,
}: {
  headers: readonly string[];
  rows: ReadonlyArray<readonly string[]>;
}) {
  return (
    <div className="my-7 overflow-x-auto border-y border-line">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm leading-6">
        <thead>
          <tr className="bg-sage/70">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="border-b border-line px-4 py-3 font-bold text-ink"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[0]}
              className="border-b border-line-soft last:border-b-0"
            >
              {row.map((cell, index) => (
                <td
                  key={`${row[0]}-${headers[index]}`}
                  className="align-top px-4 py-3 text-ink/75 first:font-semibold first:text-ink"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
