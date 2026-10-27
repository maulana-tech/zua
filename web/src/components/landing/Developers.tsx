"use client";

import { Check, Copy } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { useWallet } from "../WalletProvider";
import { nextTabIndex } from "./hooks";
import {
  Frame,
  MonoLabel,
  pillOutlineDark,
  pillSolidViolet,
  SectionIntro,
} from "./primitives";

const SNIPPETS = (origin: string) => [
  {
    id: "create",
    label: "Create a checkout",
    code: `# From your server, once per order
curl ${origin}/api/v1/checkouts \\
  -H "Authorization: Bearer zua_sk_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "25.00",
    "currency": "USD",
    "reference": "order_1042",
    "description": "Coffee x2"
  }'`,
  },
  {
    id: "response",
    label: "Response",
    code: `// 201 Created: send the buyer to "url"
{
  "id": "Q7xK2…",
  "object": "checkout",
  "status": "open",
  "currency": "USD",
  "amount": "25.00",
  "paid_zat": "0",
  "reference": "order_1042",
  "url": "${origin}/i/…",
  "embed_url": "${origin}/embed/i/…"
}`,
  },
  {
    id: "webhook",
    label: "Webhook",
    code: `// POST to your endpoint once your wallet finds the payment
// Zua-Signature: t=<unix>,v1=HMAC-SHA256(secret, "<t>.<raw body>")
{
  "id": "evt_…",
  "type": "checkout.paid",
  "created": 1792000000,
  "data": {
    "id": "Q7xK2…",
    "status": "paid",
    "reference": "order_1042"
  }
}`,
  },
  {
    id: "widget",
    label: "Widget",
    code: `<!-- A "Pay with Zcash" button, no server code -->
<script src="${origin}/embed.js" async
        data-to="@yourname" data-link="coffee"></script>`,
  },
];

const POINTS = [
  "API keys from your dashboard, sent as a Bearer token from your server",
  "Price in ZEC or USD; USD locks its rate for 30 minutes once the buyer opens it",
  "Each checkout gets its own unlinkable address, from a pool your wallet signs ahead",
  "Webhooks signed with HMAC-SHA256 and retried twice; the last 20 deliveries are logged",
];

/** Muted comments, signal-blue strings: just enough colour to scan. */
function highlight(code: string): ReactNode[] {
  return code.split("\n").map((line, i) => {
    const key = `${i}:${line}`;
    const trimmed = line.trimStart();
    if (/^(#|\/\/|<!--)/.test(trimmed))
      return (
        <span key={key} className="block text-void/55">
          {line || " "}
        </span>
      );
    // Keyed by where each string starts in the line.
    let at = 0;
    const parts = line.split(/("[^"]*"|'[^']*')/).map((part) => {
      const start = at;
      at += part.length;
      return /^["']/.test(part) ? (
        <span key={start} className="text-violet">
          {part}
        </span>
      ) : (
        part
      );
    });
    return (
      <span key={key} className="block">
        {parts}
        {line ? null : " "}
      </span>
    );
  });
}

export function Developers() {
  const { authenticated, signIn } = useWallet();
  const [origin, setOrigin] = useState("https://YOUR-ZUA");
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const snippets = SNIPPETS(origin);
  const snippet = snippets[active];

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextTabIndex(event.key, i, snippets.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section
      id="developers"
      data-ed-section
      aria-labelledby="developers-title"
      className="relative py-24 sm:py-32"
    >
      <Frame>
        <SectionIntro
          label="Developers"
          titleId="developers-title"
          title="Shielded checkout for your own store"
        >
          A one-line widget for tips and simple products, or a Checkout API with
          signed webhooks for shops. Payments go straight from the buyer&rsquo;s
          wallet to an address you signed.
        </SectionIntro>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="flex flex-col">
            <ul className="grid list-none gap-4">
              {POINTS.map((point, i) => (
                <li
                  key={point}
                  data-ed-article
                  className="flex gap-4 border-t border-starlight/15 pt-4 text-[15px] leading-relaxed"
                >
                  <MonoLabel
                    aria-hidden="true"
                    className="pt-0.5 text-[11px] text-starlight/45 tabular-nums"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </MonoLabel>
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-8 border border-starlight/15 bg-void-2 p-5 text-sm leading-relaxed text-starlight/70">
              <span className="text-starlight">How “paid” is known.</span>{" "}
              Zua&rsquo;s server can&rsquo;t see shielded payments. A checkout
              turns paid when your Zua wallet, open in a tab on a shop PC or
              phone, finds the payment and reports it. Then the webhook fires.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {authenticated ? (
                // A plain link: the dashboard needs a full, isolated load.
                <a href="/developers" className={pillSolidViolet}>
                  Get an API key
                </a>
              ) : (
                <button
                  type="button"
                  className={pillSolidViolet}
                  onClick={() => signIn()}
                >
                  Get an API key
                </button>
              )}
              <a href="/embed-demo.html" className={pillOutlineDark}>
                See the widget demo
              </a>
            </div>
          </div>

          <div className="min-w-0 bg-starlight text-void">
            <div className="flex items-center justify-between gap-3 border-b border-void/10 pr-2">
              <div
                role="tablist"
                aria-label="Code examples"
                className="flex overflow-x-auto"
              >
                {snippets.map((s, i) => (
                  <button
                    key={s.id}
                    ref={(el) => {
                      tabs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`dev-tab-${s.id}`}
                    aria-selected={i === active}
                    aria-controls="dev-panel"
                    tabIndex={i === active ? 0 : -1}
                    onClick={() => setActive(i)}
                    onKeyDown={(event) => onKeyDown(event, i)}
                    className={cn(
                      "min-h-12 shrink-0 border-b-2 px-4 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet",
                      i === active
                        ? "border-violet text-void"
                        : "border-transparent text-void/55 hover:text-void",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(snippet.code)
                    .then(() => setCopied(true));
                }}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-void/20 px-3 text-xs text-void/80 transition-colors hover:border-void/60 hover:text-void focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              >
                {copied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
                <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <div
              id="dev-panel"
              role="tabpanel"
              aria-labelledby={`dev-tab-${snippet.id}`}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable code must be reachable by keyboard
              tabIndex={0}
              className="overflow-x-auto p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet sm:p-7"
            >
              <pre className="min-h-[300px] font-landing-mono text-[13px] leading-relaxed">
                <code>{highlight(snippet.code)}</code>
              </pre>
            </div>
          </div>
        </div>
      </Frame>
    </section>
  );
}
