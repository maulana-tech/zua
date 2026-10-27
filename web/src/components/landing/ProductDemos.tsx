"use client";

import {
  BadgeCheck,
  Check,
  Copy,
  Delete,
  Lock,
  RotateCcw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { type PadKey, padKeyFor, pressKey } from "@/features/pos/keypad";
import { useFiat } from "@/features/zcash/useZecPrice";
import { fiatDecimals, formatFiatPrice } from "@/lib/fiat";
import { cn } from "@/lib/utils";
import { zatToZec } from "@/lib/zcash/units";
import { Mascot } from "../Mascot";
import { useReducedMotion } from "./hooks";
import {
  FauxQr,
  MockButton,
  MockGhostButton,
  MockRow,
  MockWindow,
  StatusChip,
} from "./mocks";
import { MonoLabel, segmentButton, segmentGroup } from "./primitives";

/** Runs `fn` after `ms`, or right away when motion is reduced. */
function useLater() {
  const reduce = useReducedMotion();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, reduce ? 0 : ms);
  };
}

function DemoNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-center font-landing-mono text-[11px] uppercase tracking-[0.16em] text-starlight/55">
      {children}
    </p>
  );
}

/* ---- Payment links ------------------------------------------------------ */

export function LinksDemo() {
  const [open, setOpen] = useState(false);
  return (
    <MockWindow title={`zua/pay/dinar/${open ? "tips" : "brand-audit"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center bg-indigo-glow text-sm text-white"
          >
            D
          </span>
          <span>
            <span className="block text-sm">@dinar</span>
            <span className="flex items-center gap-1 text-xs whitespace-nowrap text-(--signal-ink)">
              <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified
            </span>
          </span>
        </span>
        <fieldset className={cn(segmentGroup, "shrink-0 flex-nowrap p-0.5")}>
          <legend className="sr-only">Price</legend>
          <button
            type="button"
            aria-pressed={!open}
            onClick={() => setOpen(false)}
            className={cn(segmentButton, "min-h-8 px-3 text-xs")}
          >
            Fixed
          </button>
          <button
            type="button"
            aria-pressed={open}
            onClick={() => setOpen(true)}
            className={cn(segmentButton, "min-h-8 px-3 text-xs")}
          >
            Open
          </button>
        </fieldset>
      </div>

      <div className="mt-6 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-sm text-starlight/55">
            {open ? "Tip jar" : "Brand audit"}
          </p>
          {open ? (
            <p className="mt-2 border-b border-violet pb-1 text-3xl font-normal text-starlight/50">
              0.00 <span className="text-base">ZEC</span>
            </p>
          ) : (
            <p className="mt-1 text-3xl font-normal">
              0.35 <span className="text-base text-starlight/60">ZEC</span>
            </p>
          )}
          <p className="mt-2 text-sm text-starlight/55">
            {open
              ? "The payer picks the amount."
              : "One-hour review of your brand kit."}
          </p>
        </div>
        <div className="shrink-0 border border-starlight/10 bg-white p-2">
          <FauxQr seed={open ? 11 : 7} className="size-24" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[1fr_auto] gap-2">
        <MockButton decorative>
          <Wallet className="size-4" aria-hidden="true" /> Open in wallet
        </MockButton>
        <MockGhostButton decorative>
          <Copy className="size-4" aria-hidden="true" />
        </MockGhostButton>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-starlight/55">
        Address signed by @dinar, fresh for this link. Any shielded Zcash wallet
        can pay it.
      </p>
    </MockWindow>
  );
}

/* ---- Invoices ----------------------------------------------------------- */

type InvoiceState = "pending" | "checking" | "paid";

export function InvoiceDemo() {
  const [state, setState] = useState<InvoiceState>("pending");
  const later = useLater();

  return (
    <MockWindow title="zua/i/Q7xK2…">
      <div className="flex items-start justify-between gap-3">
        <div>
          <MonoLabel className="text-[11px] text-starlight/50">
            Invoice from @dinar
          </MonoLabel>
          <p className="mt-1.5 text-xl font-normal">INV-0042</p>
        </div>
        <StatusChip tone={state === "paid" ? "done" : "muted"}>
          {state === "paid" ? (
            <>
              <Check className="size-3" aria-hidden="true" /> Paid
            </>
          ) : state === "checking" ? (
            "Wallet syncing…"
          ) : (
            "Awaiting payment"
          )}
        </StatusChip>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-starlight/50">Bill to</dt>
          <dd className="mt-0.5">Northwind Studio</dd>
        </div>
        <div>
          <dt className="text-starlight/50">Due (UTC)</dt>
          <dd className="mt-0.5">Nov 1, 2026</dd>
        </div>
      </dl>

      <div className="mt-5 border-y border-starlight/10 py-3 text-sm">
        <div className="flex justify-between">
          <span>Logo design, 3 concepts</span>
          <span className="tabular-nums">0.80 ZEC</span>
        </div>
      </div>
      <div className="mt-3 flex justify-between text-base">
        <span>Total</span>
        <span className="tabular-nums">0.80 ZEC</span>
      </div>

      <div aria-live="polite" className="mt-5 min-h-[86px]">
        {state === "paid" ? (
          <div className="flex items-center gap-4 border border-violet/50 bg-violet/10 p-3.5">
            <Mascot mood="success" size={44} tone="ink" />
            <p className="text-sm leading-relaxed">
              Your wallet found 0.80 ZEC with memo{" "}
              <code className="font-landing-mono text-xs">zua:inv:Q7xK2…</code>{" "}
              and marked it paid.
            </p>
          </div>
        ) : (
          <MockButton
            disabled={state === "checking"}
            onClick={() => {
              setState("checking");
              later(() => setState("paid"), 1400);
            }}
          >
            {state === "checking"
              ? "Finding the payment…"
              : "Simulate a payment"}
          </MockButton>
        )}
      </div>
      {state === "paid" ? (
        <button
          type="button"
          onClick={() => setState("pending")}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-starlight/60 underline-offset-4 hover:text-starlight hover:underline"
        >
          <RotateCcw className="size-3" aria-hidden="true" /> Reset demo
        </button>
      ) : null}
    </MockWindow>
  );
}

/* ---- Point of sale ------------------------------------------------------ */

const PAD: { key: PadKey; label: ReactNode; name?: string }[] = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: ".", label: "." },
  { key: "0", label: "0" },
  {
    key: "back",
    label: <Delete className="size-4" aria-hidden="true" />,
    name: "Delete digit",
  },
];

type Sale = "typing" | "waiting" | "paid";

// About the price of a coffee, to open the keypad on a believable number.
const COFFEE_ZAT = 370_000n;

/** A round counter price: two significant digits, or halves with decimals. */
export function counterPrice(amount: number, decimals: number): string {
  if (!(amount > 0)) return "";
  if (decimals === 0) {
    const step = 10 ** Math.max(0, Math.floor(Math.log10(amount)) - 1);
    return String(Math.round(amount / step) * step);
  }
  return Math.max(0.5, Math.round(amount * 2) / 2).toFixed(2);
}

/** The real POS keypad logic, with the visitor's currency at the live rate. */
export function PosDemo() {
  const fiat = useFiat();
  const [typed, setTyped] = useState("");
  const [sale, setSale] = useState<Sale>("typing");
  const later = useLater();

  // Without a live price the counter takes ZEC directly, as the app does.
  const code = fiat.rate === null ? null : fiat.currency;
  const decimals = code ? fiatDecimals(code) : 8;
  const amount = Number(typed || "0");
  const zat =
    code === null
      ? amount > 0
        ? BigInt(Math.round(amount * 1e8))
        : null
      : fiat.toZat(amount);
  const shown = code ? formatFiatPrice(amount, code) : `${typed || "0"} ZEC`;

  // Start from the price of a coffee once the visitor's rate is known.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !fiat.rate) return;
    seeded.current = true;
    setTyped(
      counterPrice(
        (Number(COFFEE_ZAT) / 1e8) * fiat.rate,
        fiatDecimals(fiat.currency),
      ),
    );
  }, [fiat.rate, fiat.currency]);

  const press = (key: PadKey) => setTyped((v) => pressKey(v, key, decimals));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = padKeyFor(event.key);
    if (!key || sale !== "typing") return;
    event.preventDefault();
    press(key);
  };

  return (
    <MockWindow title="zua/pos · Kopi Senja">
      {sale === "typing" ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: keyboard typing for the keypad below
        <div onKeyDown={onKeyDown}>
          <p className="text-right text-sm text-starlight/55">Charge</p>
          <p
            aria-live="polite"
            className="mt-1 truncate text-right text-4xl font-normal tracking-tight tabular-nums"
          >
            {shown}
          </p>
          <p className="mt-1 h-5 text-right text-sm text-(--signal-ink) tabular-nums">
            {code && zat ? `≈ ${zatToZec(zat)} ZEC` : ""}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {PAD.map(({ key, label, name }) => (
              <button
                key={key}
                type="button"
                aria-label={name}
                onClick={() => press(key)}
                disabled={key === "." && decimals === 0}
                className="grid h-12 place-items-center border border-starlight/10 bg-void text-lg transition-colors hover:border-starlight/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:opacity-30"
              >
                {label}
              </button>
            ))}
          </div>
          <MockButton
            className="mt-3"
            disabled={!zat}
            onClick={() => {
              setSale("waiting");
              later(() => setSale("paid"), 2600);
            }}
          >
            Charge {shown}
          </MockButton>
        </div>
      ) : (
        <div aria-live="polite" className="text-center">
          {sale === "paid" ? (
            <div className="grid min-h-[300px] place-items-center content-center gap-3">
              <Mascot mood="success" size={72} tone="ink" />
              <p className="text-2xl font-normal">Paid</p>
              <p className="text-sm text-starlight/60">
                {zat ? `${zatToZec(zat)} ZEC` : ""} · {shown}
              </p>
            </div>
          ) : (
            <div className="grid min-h-[300px] place-items-center content-center gap-3">
              <MonoLabel className="text-[11px] text-starlight/50">
                Scan to pay
              </MonoLabel>
              <p className="text-2xl font-normal tabular-nums">
                {zat ? zatToZec(zat) : ""} ZEC
              </p>
              <div className="border border-starlight/10 bg-white p-2">
                <FauxQr seed={23} className="size-32" />
              </div>
              <p className="flex items-center gap-2 text-sm text-starlight/60">
                <span className="size-1.5 rounded-full bg-violet motion-safe:animate-pulse" />
                Waiting for payment…
              </p>
            </div>
          )}
          <MockGhostButton
            className="mt-2 w-full"
            onClick={() => setSale("typing")}
          >
            {sale === "paid" ? "New sale" : "Cancel sale"}
          </MockGhostButton>
        </div>
      )}
      <DemoNote>
        {code ? `Live ${code} rate · demo payment` : "Demo payment"}
      </DemoNote>
    </MockWindow>
  );
}

/* ---- Requests ----------------------------------------------------------- */

export function RequestsDemo() {
  const [paid, setPaid] = useState(false);
  return (
    <MockWindow title="zua · Requests">
      <MonoLabel className="text-[11px] text-starlight/50">Incoming</MonoLabel>
      <div className="mt-3 border border-starlight/10 bg-void p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <span className="text-starlight">@budi</span>{" "}
            <span className="text-starlight/60">asked you for</span>
          </p>
          {paid ? (
            <StatusChip tone="done">
              <Check className="size-3" aria-hidden="true" /> Paid
            </StatusChip>
          ) : (
            <StatusChip>Pending</StatusChip>
          )}
        </div>
        <p className="mt-2 text-3xl font-normal tabular-nums">
          0.0150 <span className="text-base text-starlight/60">ZEC</span>
        </p>
        <p className="mt-1 text-sm text-starlight/60">
          “Your half of Friday dinner”
        </p>
        <div aria-live="polite" className="mt-4">
          {paid ? (
            <p className="text-sm text-(--signal-ink)">
              Sent. @budi sees it as paid too.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <MockButton onClick={() => setPaid(true)}>Pay</MockButton>
              <MockGhostButton decorative>Decline</MockGhostButton>
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-starlight/55">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Amount and note are encrypted between the two accounts. Zua stores the
        ciphertext only.
      </p>
      {paid ? (
        <button
          type="button"
          onClick={() => setPaid(false)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-starlight/60 underline-offset-4 hover:text-starlight hover:underline"
        >
          <RotateCcw className="size-3" aria-hidden="true" /> Reset demo
        </button>
      ) : null}
    </MockWindow>
  );
}

/* ---- Payroll ------------------------------------------------------------ */

const TEAM = [
  { to: "@ana", zat: 40_000_000n, note: "October" },
  { to: "@rio", zat: 35_000_000n, note: "October + overtime" },
  { to: "@mei", zat: 35_000_000n, note: "October" },
  { to: "zs1q8v…k4x", zat: 20_000_000n, note: "Contract, week 43" },
];

export function PayrollDemo() {
  const [included, setIncluded] = useState(() => TEAM.map(() => true));
  const count = included.filter(Boolean).length;
  const total = TEAM.reduce(
    (sum, row, i) => (included[i] ? sum + row.zat : sum),
    0n,
  );

  return (
    <MockWindow title="zua · Payroll">
      <fieldset>
        <legend className="sr-only">Who to pay this run</legend>
        <ul className="grid list-none gap-1.5">
          {TEAM.map((row, i) => (
            <li key={row.to}>
              <label className="flex cursor-pointer items-center gap-3 border border-starlight/10 bg-void px-3.5 py-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet">
                <input
                  type="checkbox"
                  checked={included[i]}
                  onChange={() =>
                    setIncluded((v) => v.map((on, j) => (j === i ? !on : on)))
                  }
                  className="size-4 accent-[rgb(21_19_16)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.to}</span>
                  <span className="block truncate text-xs text-starlight/50">
                    {row.note}
                  </span>
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    !included[i] && "text-starlight/35 line-through",
                  )}
                >
                  {zatToZec(row.zat)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="mt-4 grid gap-2">
        <MockRow
          label="Total"
          value={<span className="tabular-nums">{zatToZec(total)} ZEC</span>}
        />
        <MockRow accent label="Network fee" value="Exact, before you confirm" />
      </div>
      <MockButton
        decorative
        className={cn("mt-4", count === 0 && "opacity-40")}
      >
        Pay {count} {count === 1 ? "person" : "people"} in one transaction
      </MockButton>
      <p className="mt-3 text-xs text-starlight/55">
        Each person sees only their own payment and note.
      </p>
    </MockWindow>
  );
}

/* ---- Claim links -------------------------------------------------------- */

export function ClaimDemo() {
  const [claimed, setClaimed] = useState(false);
  return (
    <MockWindow title="zua/claim">
      <div className="break-all border border-starlight/10 bg-void px-3.5 py-3 font-landing-mono text-xs leading-relaxed">
        <span className="text-starlight/55">https://zua.app/claim/7Qx2</span>
        <span className="bg-violet/20 text-starlight">#k=f3a9c1…e07b</span>
      </div>
      <p className="mt-2 text-xs text-starlight/55">
        Highlighted: the key. Browsers never send what follows{" "}
        <code className="font-landing-mono">#</code> to a server.
      </p>

      <div className="mt-6 border-t border-starlight/10 pt-6">
        <p className="text-2xl font-normal">0.003 ZEC for you</p>
        <p className="mt-1 text-sm text-starlight/60">
          “Happy birthday!” (a note from the sender)
        </p>
        <div aria-live="polite" className="mt-5">
          {claimed ? (
            <div className="flex items-center gap-4 border border-violet/50 bg-violet/10 p-3.5">
              <Mascot mood="success" size={44} tone="ink" />
              <p className="text-sm">
                Claimed 0.003 ZEC. It arrives once the transaction is mined.
              </p>
            </div>
          ) : (
            <MockButton onClick={() => setClaimed(true)}>
              Claim into my wallet
            </MockButton>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-starlight/55">
        Until it&rsquo;s claimed, the sender can take it back.
      </p>
      {claimed ? (
        <button
          type="button"
          onClick={() => setClaimed(false)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-starlight/60 underline-offset-4 hover:text-starlight hover:underline"
        >
          <RotateCcw className="size-3" aria-hidden="true" /> Reset demo
        </button>
      ) : null}
    </MockWindow>
  );
}

/* ---- Receipts ----------------------------------------------------------- */

export function ReceiptDemo() {
  const [edited, setEdited] = useState(false);
  const amount = edited ? "95000000" : "80000000";
  return (
    <MockWindow title="zua/verify">
      <div className="flex items-center justify-between gap-3">
        <MonoLabel className="text-[11px] text-starlight/50">
          receipt.json
        </MonoLabel>
        <fieldset className={cn(segmentGroup, "shrink-0 flex-nowrap p-0.5")}>
          <legend className="sr-only">Which file to check</legend>
          <button
            type="button"
            aria-pressed={!edited}
            onClick={() => setEdited(false)}
            className={cn(segmentButton, "min-h-8 px-3 text-xs")}
          >
            Original
          </button>
          <button
            type="button"
            aria-pressed={edited}
            onClick={() => setEdited(true)}
            className={cn(segmentButton, "min-h-8 px-3 text-xs")}
          >
            Edited
          </button>
        </fieldset>
      </div>
      <pre className="mt-3 overflow-x-auto border border-starlight/10 bg-void p-3.5 font-landing-mono text-[11.5px] leading-relaxed text-starlight/75">
        {`{
  "kind": "received",
  "signer": "dinar",
  "items": [{
    "txid": "105e33ca…",
    "amountZat": `}
        <span
          className={cn(
            edited && "bg-violet/25 text-starlight",
            "transition-colors",
          )}
        >{`"${amount}"`}</span>
        {`,
    "memo": "zua:inv:Q7xK2…",
    "disclosures": [{ "pool": "orchard", … }]
  }],
  "sigHex": "a41f…9c02"
}`}
      </pre>
      <div
        aria-live="polite"
        className={cn(
          "mt-4 border p-4",
          edited ? "border-starlight/25" : "border-violet/50 bg-violet/10",
        )}
      >
        {edited ? (
          <p className="flex items-start gap-2.5 text-sm leading-relaxed">
            <ShieldAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            The signature doesn&rsquo;t match. The file was edited or not issued
            by this user.
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm">
              <BadgeCheck
                className="size-4 text-(--signal-ink)"
                aria-hidden="true"
              />
              Verified on Zcash
            </p>
            <p className="mt-2 text-xs leading-relaxed text-starlight/60">
              Received by @dinar (signature checked) · 0.80 ZEC proven on chain
              · memo matches
            </p>
          </>
        )}
      </div>
    </MockWindow>
  );
}
