import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Code2,
  Coffee,
  Globe2,
  PenTool,
  Users as UsersIcon,
} from "lucide-react";
import { Frame, MonoLabel } from "./primitives";

const AUDIENCES: {
  icon: LucideIcon;
  title: string;
  body: string;
  uses: string[];
  keepsPrivate: string;
}[] = [
  {
    icon: PenTool,
    title: "Freelancers",
    body: "Invoice clients abroad in USD or ZEC. The invoice turns paid by itself, and the receipt is ready for your accountant.",
    uses: ["Invoices", "Recurring", "Receipts"],
    keepsPrivate: "Your rates",
  },
  {
    icon: UsersIcon,
    title: "Creators",
    body: "Put your @username page in your bio and a tip button on your site. Fans pay from any Zcash wallet.",
    uses: ["@username page", "Widget"],
    keepsPrivate: "Your revenue",
  },
  {
    icon: Coffee,
    title: "Cafés & shops",
    body: "Ring up a sale in your own currency on a phone or tablet, turn it to the customer, and watch it turn paid.",
    uses: ["Point of sale", "CSV export"],
    keepsPrivate: "Your daily takings",
  },
  {
    icon: Building2,
    title: "Agencies",
    body: "One invoice per client, each paying its own address. No client can look up who else you work for.",
    uses: ["Invoices", "Payment links"],
    keepsPrivate: "Your client list",
  },
  {
    icon: Globe2,
    title: "Remote teams",
    body: "Pay up to 50 people in one shielded transaction from a CSV. Each person sees only their own line.",
    uses: ["Payroll", "Claim links"],
    keepsPrivate: "Everyone's salary",
  },
  {
    icon: Code2,
    title: "Online stores",
    body: "Create a checkout per order from your server and get a signed webhook when it's paid.",
    uses: ["Checkout API", "Webhooks"],
    keepsPrivate: "Your sales volume",
  },
];

export function Users() {
  return (
    <section
      id="who"
      data-ed-section
      aria-labelledby="who-title"
      className="relative pb-24 text-graphite sm:pb-32"
    >
      <Frame>
        <div className="grid gap-6 border-t border-graphite/10 pt-24 sm:pt-28 lg:grid-cols-[1fr_1fr]">
          <div>
            <MonoLabel className="text-graphite/60">
              Who it&rsquo;s for
            </MonoLabel>
            <h2
              id="who-title"
              className="mt-4 text-[clamp(1.9rem,3vw,2.8rem)] font-normal tracking-tight"
            >
              Built for people who get paid online
            </h2>
          </div>
          <p className="max-w-[48ch] self-end text-lg leading-relaxed text-graphite/75">
            If your invoices land on a public blockchain, so does your business.
            Zua gives you crypto payments without turning your income into
            public data.
          </p>
        </div>

        {/* 1px gaps over a tinted background draw the hairline grid. */}
        <ul className="mt-16 grid list-none gap-px overflow-hidden rounded-none border border-graphite/10 bg-graphite/10 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map(
            ({ icon: Icon, title, body, uses, keepsPrivate }, index) => (
              <li
                key={title}
                data-ed-article
                className="group flex flex-col bg-void-2 p-7 sm:p-8"
              >
                <div className="flex items-center justify-between">
                  <span
                    aria-hidden="true"
                    className="flex size-11 items-center justify-center rounded-none border border-graphite/15 bg-white text-graphite transition-colors duration-200 group-hover:border-graphite group-hover:bg-graphite group-hover:text-mist"
                  >
                    <Icon className="size-5" strokeWidth={1.6} />
                  </span>
                  <MonoLabel
                    aria-hidden="true"
                    className="text-graphite/40 tabular-nums"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </MonoLabel>
                </div>

                <h3 className="mt-10 text-2xl font-normal tracking-tight">
                  {title}
                </h3>
                <p className="mt-3 max-w-[36ch] flex-1 text-[15px] leading-relaxed text-graphite/65">
                  {body}
                </p>
                <ul
                  aria-label={`Zua tools for ${title.toLowerCase()}`}
                  className="mt-6 flex list-none flex-wrap gap-1.5"
                >
                  {uses.map((use) => (
                    <li
                      key={use}
                      className="border border-graphite/15 px-2 py-1 font-landing-mono text-[11px] text-graphite/70"
                    >
                      {use}
                    </li>
                  ))}
                </ul>

                <dl className="mt-8 flex items-center justify-between gap-4 border-t border-graphite/15 pt-5">
                  <dt>
                    <MonoLabel className="text-[11px] text-graphite/50">
                      Stays private
                    </MonoLabel>
                  </dt>
                  <dd className="flex items-center gap-2 text-sm font-medium">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-violet"
                    />
                    {keepsPrivate}
                  </dd>
                </dl>
              </li>
            ),
          )}
        </ul>
      </Frame>
    </section>
  );
}
