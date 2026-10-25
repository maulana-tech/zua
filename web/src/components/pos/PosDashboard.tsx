"use client";

import {
  Check,
  Delete,
  Download,
  Expand,
  Loader,
  Shrink,
  Volume2,
  VolumeX,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  displayTyped,
  type PadKey,
  padKeyFor,
  pressKey,
} from "../../features/pos/keypad";
import {
  addSale,
  dayTotal,
  MAX_NOTE_LENGTH,
  SALES_RECORD,
  type Sale,
  type SaleStatus,
  saleMemo,
  salePayments,
  saleStatus,
  salesCsv,
} from "../../features/pos/sales";
import { useWakeLock } from "../../features/pos/useWakeLock";
import {
  chime,
  loadAlertPrefs,
  saveAlertPrefs,
} from "../../features/zcash/paymentAlerts";
import { type Fiat, useFiat } from "../../features/zcash/useZecPrice";
import { APP_NAME } from "../../lib/brand";
import { downloadText } from "../../lib/download";
import { type FiatCode, fiatDecimals, formatFiatPrice } from "../../lib/fiat";
import { unlockLabel } from "../../lib/passkey";
import { newMemoId } from "../../lib/zcash/memo";
import { zatToZec, zecToZat } from "../../lib/zcash/units";
import { buildPaymentUri } from "../../lib/zcash/zip321";
import { DashboardNotice } from "../dashboard/DashboardNotice";
import { DashboardPageHeader } from "../dashboard/DashboardPageHeader";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashFocus,
  dashIconButton,
  dashLedger,
} from "../dashboard/styles";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";

type Unit = "fiat" | "zec";

const PAD: PadKey[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "0",
  "back",
];

const STATUS_LABEL: Record<SaleStatus, string> = {
  waiting: "Waiting",
  partial: "Partly paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

function currencySymbol(code: FiatCode): string {
  return (
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? code
  );
}

/** "12.50" → "12.5", "1200" stays: the keypad string for a converted amount. */
function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function typedZat(value: string, unit: Unit, fiat: Fiat): bigint | null {
  const clean = value.replace(/\.$/, "");
  if (!clean) return null;
  if (unit === "fiat") return fiat.toZat(Number(clean));
  try {
    const zat = zecToZat(clean);
    return zat > 0n ? zat : null;
  } catch {
    return null;
  }
}

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

export function PosDashboard() {
  const {
    accountUnlocked,
    promptUnlock,
    recoveryMethod,
    username,
    businessName,
    zcash,
    watchPayments,
    loadLocal,
    saveLocal,
  } = useWallet();
  const fiat = useFiat();
  const [sales, setSales] = useState<Sale[] | null>(null);
  const salesRef = useRef<Sale[]>([]);
  const [saveError, setSaveError] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [chosenUnit, setChosenUnit] = useState<Unit | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [sound, setSound] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const unit: Unit = chosenUnit ?? (fiat.rate === null ? "zec" : "fiat");
  const decimals = unit === "fiat" ? fiatDecimals(fiat.currency) : 8;
  const amountZat = typedZat(value, unit, fiat);
  const title = businessName ?? "Point of sale";

  useEffect(() => {
    setSound(loadAlertPrefs().sound);
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const onChange = () =>
      setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!accountUnlocked) return;
    let alive = true;
    loadLocal<Sale[]>(SALES_RECORD)
      .catch(() => null)
      .then((saved) => {
        if (!alive) return;
        salesRef.current = saved ?? [];
        setSales(salesRef.current);
      });
    return () => {
      alive = false;
    };
  }, [accountUnlocked, loadLocal]);

  const updateSales = useCallback(
    (change: (sales: Sale[]) => Sale[]) => {
      const next = change(salesRef.current);
      salesRef.current = next;
      setSales(next);
      setSaveError("");
      saveLocal(SALES_RECORD, next).catch(() =>
        setSaveError(
          "Couldn't save the sales log on this device. Export it before closing this tab.",
        ),
      );
    },
    [saveLocal],
  );

  const payments = useMemo(() => salePayments(zcash.history), [zcash.history]);
  const current = sales?.find((s) => s.id === currentId) ?? null;
  const currentPayment = current ? payments.get(current.id) : undefined;
  const status = current ? saleStatus(current, currentPayment) : null;
  const waiting = current !== null && status !== "paid";

  useEffect(() => {
    if (!waiting) return;
    return watchPayments();
  }, [waiting, watchPayments]);
  useWakeLock(current !== null);
  const now = useNow(5_000, waiting);

  const charge = useCallback(() => {
    if (!amountZat || !zcash.address || sales === null) return;
    const sale: Sale = {
      id: newMemoId(),
      amountZat: amountZat.toString(),
      fiat:
        unit === "fiat"
          ? { code: fiat.currency, amount: Number(value.replace(/\.$/, "")) }
          : null,
      note: note.trim().slice(0, MAX_NOTE_LENGTH),
      createdAt: Date.now(),
      cancelled: false,
    };
    updateSales((list) => addSale(list, sale));
    setCurrentId(sale.id);
    setValue("");
    setNote("");
  }, [
    amountZat,
    zcash.address,
    sales,
    unit,
    fiat.currency,
    value,
    note,
    updateSales,
  ]);

  function cancel() {
    if (!current) return;
    const id = current.id;
    updateSales((list) =>
      list.map((s) => (s.id === id ? { ...s, cancelled: true } : s)),
    );
    setCurrentId(null);
  }

  function resume(sale: Sale) {
    if (sale.cancelled)
      updateSales((list) =>
        list.map((s) => (s.id === sale.id ? { ...s, cancelled: false } : s)),
      );
    setCurrentId(sale.id);
  }

  function switchUnit(next: Unit) {
    if (next === unit) return;
    if (amountZat) {
      if (next === "zec") setValue(zatToZec(amountZat));
      else if (fiat.rate !== null) {
        const amount = (Number(amountZat) / 1e8) * fiat.rate;
        setValue(trimDecimal(amount.toFixed(fiatDecimals(fiat.currency))));
      }
    } else setValue("");
    setChosenUnit(next);
  }

  function press(key: PadKey) {
    if (chosenUnit === null) setChosenUnit(unit);
    setValue((v) => pressKey(v, key, decimals));
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    saveAlertPrefs({ ...loadAlertPrefs(), sound: next });
    if (next) chime();
  }

  function toggleFullscreen() {
    if (fullscreen) void document.exitFullscreen().catch(() => {});
    else void panelRef.current?.requestFullscreen().catch(() => {});
  }

  // A physical keyboard or barcode-style numpad works on the keypad.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [role=dialog]")) return;
    if (!current) {
      if (e.key === "Enter" && amountZat) {
        e.preventDefault();
        charge();
        return;
      }
      const key = padKeyFor(e.key);
      if (key) {
        e.preventDefault();
        press(key);
      }
    } else if (status === "paid" && e.key === "Enter") {
      e.preventDefault();
      setCurrentId(null);
    }
  };
  useEffect(() => {
    if (!accountUnlocked) return;
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [accountUnlocked]);

  const today = useMemo(
    () => dayTotal(sales ?? [], payments, Date.now()),
    [sales, payments],
  );

  if (!accountUnlocked)
    return (
      <>
        <DashboardPageHeader
          title="Point of sale"
          description="Charge customers in person. They scan and pay from any Zcash wallet."
        />
        <DashboardNotice
          label="Locked"
          title="Unlock to start selling"
          action={
            <button
              type="button"
              className={dashButtonPrimary}
              onClick={promptUnlock}
            >
              {unlockLabel(recoveryMethod)}
            </button>
          }
        >
          Your wallet watches for each payment on this device, so it has to be
          unlocked while you sell.
        </DashboardNotice>
      </>
    );

  const ready = Boolean(zcash.address) && sales !== null;
  const remaining =
    current && currentPayment
      ? BigInt(current.amountZat) - currentPayment.paidZat
      : current
        ? BigInt(current.amountZat)
        : 0n;
  const uri =
    current && zcash.address && remaining > 0n
      ? buildPaymentUri({
          address: zcash.address,
          amountZat: remaining,
          memo: saleMemo(current),
          label: businessName ?? `@${username} on ${APP_NAME}`,
          message: current.note || undefined,
        })
      : null;
  const checkedAgo = zcash.lastSyncedAt
    ? Math.max(0, Math.round((now - zcash.lastSyncedAt) / 1000))
    : null;

  return (
    <>
      <DashboardPageHeader
        title={title}
        description="Type the amount, then turn the screen to your customer. They scan with any Zcash wallet and the sale is marked paid here. Sales are kept only on this device."
        action={
          <button
            type="button"
            className={dashButtonSecondary}
            onClick={toggleSound}
            aria-pressed={sound}
          >
            {sound ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            )}
            {sound ? "Sound on" : "Sound off"}
          </button>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className={dashLedger}>
          <section
            ref={panelRef}
            className={`${dashCell} relative p-5 sm:p-8 [&:fullscreen]:grid [&:fullscreen]:place-items-center [&:fullscreen]:overflow-auto`}
            aria-label="Checkout"
          >
            {canFullscreen ? (
              <button
                type="button"
                className={`${dashIconButton} absolute top-3 right-3`}
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                title={
                  fullscreen
                    ? "Exit full screen"
                    : "Full screen for the customer"
                }
              >
                {fullscreen ? (
                  <Shrink aria-hidden="true" />
                ) : (
                  <Expand aria-hidden="true" />
                )}
              </button>
            ) : null}

            <div className="mx-auto w-full max-w-md">
              {!ready ? (
                <p
                  className="flex items-center gap-2 py-16 text-sm text-(--dash-ash)"
                  role="status"
                >
                  <Loader
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  Opening your wallet…
                </p>
              ) : current && status === "paid" ? (
                <PaidView
                  sale={current}
                  paidZat={currentPayment?.paidZat ?? 0n}
                  fiat={fiat}
                  onNext={() => setCurrentId(null)}
                />
              ) : current && uri ? (
                <div className="grid justify-items-center gap-5 text-center">
                  <div>
                    <p className="dashboard-tile-title">Scan to pay</p>
                    <p className="mt-3 text-4xl tracking-tight tabular-nums sm:text-5xl">
                      {zatToZec(remaining)} ZEC
                    </p>
                    <p className="mt-1 text-sm text-(--dash-ash)">
                      {current.fiat && status !== "partial"
                        ? formatFiatPrice(
                            current.fiat.amount,
                            current.fiat.code,
                          )
                        : fiat.format(remaining)}
                      {current.note ? ` · ${current.note}` : ""}
                    </p>
                  </div>
                  <div className="aspect-square w-full max-w-80 rounded-(--dash-radius-sm) bg-[#fff] p-4">
                    <QRCodeSVG
                      value={uri}
                      size={360}
                      level="M"
                      fgColor="#0D0C14"
                      bgColor="#FFFFFF"
                      className="size-full"
                      aria-label="Zcash payment QR code"
                    />
                  </div>
                  {status === "partial" && currentPayment ? (
                    <p className="text-sm" role="status">
                      Received {zatToZec(currentPayment.paidZat)} of{" "}
                      {zatToZec(BigInt(current.amountZat))} ZEC. The customer
                      can scan again to pay the rest.
                    </p>
                  ) : null}
                  <div className="grid gap-1" aria-live="polite">
                    <p className="flex items-center justify-center gap-2 text-sm font-medium">
                      <Loader
                        className="size-4 motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                      Waiting for payment
                    </p>
                    <p className="max-w-sm text-xs leading-5 text-(--dash-ash)">
                      It shows here once the payment is in a block, usually a
                      minute or two after the customer sends it.
                      {zcash.status === "error"
                        ? " Your wallet can't reach the network right now."
                        : checkedAgo !== null
                          ? ` Checked ${checkedAgo < 10 ? "just now" : `${checkedAgo}s ago`}.`
                          : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={dashButtonSecondary}
                    onClick={cancel}
                  >
                    Cancel sale
                  </button>
                </div>
              ) : (
                <AmountEntry
                  unit={unit}
                  fiat={fiat}
                  value={value}
                  amountZat={amountZat}
                  note={note}
                  onNote={setNote}
                  onUnit={switchUnit}
                  onPress={press}
                  onCharge={charge}
                />
              )}
            </div>
          </section>
        </div>

        <SalesPanel
          sales={sales ?? []}
          payments={payments}
          today={today}
          fiat={fiat}
          currentId={currentId}
          saveError={saveError}
          onResume={resume}
        />
      </div>
    </>
  );
}

function AmountEntry({
  unit,
  fiat,
  value,
  amountZat,
  note,
  onNote,
  onUnit,
  onPress,
  onCharge,
}: {
  unit: Unit;
  fiat: Fiat;
  value: string;
  amountZat: bigint | null;
  note: string;
  onNote: (note: string) => void;
  onUnit: (unit: Unit) => void;
  onPress: (key: PadKey) => void;
  onCharge: () => void;
}) {
  const shown =
    unit === "fiat"
      ? `${currencySymbol(fiat.currency)} ${displayTyped(value)}`
      : `${displayTyped(value)} ZEC`;
  const other =
    amountZat === null
      ? null
      : unit === "fiat"
        ? `${zatToZec(amountZat)} ZEC`
        : fiat.format(amountZat);

  return (
    <div className="grid gap-5">
      <fieldset className="flex justify-center gap-1 rounded-full border border-(--dash-line) p-1 justify-self-center">
        <legend className="sr-only">Charge in</legend>
        {(
          [
            ["fiat", fiat.currency],
            ["zec", "ZEC"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={unit === key}
            disabled={key === "fiat" && fiat.rate === null}
            title={
              key === "fiat" && fiat.rate === null
                ? "The ZEC price is unavailable right now"
                : undefined
            }
            onClick={() => onUnit(key)}
            className={`h-8 rounded-full px-4 text-xs font-semibold tracking-[0.08em] transition-colors disabled:opacity-40 ${dashFocus} ${
              unit === key
                ? "bg-(--dash-fg) text-(--dash-surface)"
                : "text-(--dash-ash) hover:text-(--dash-fg)"
            }`}
          >
            {label}
          </button>
        ))}
      </fieldset>

      <div className="text-center" aria-live="polite">
        <p className="break-all text-[clamp(2.25rem,8vw,3.5rem)] leading-tight tracking-tight tabular-nums">
          {shown}
        </p>
        <p className="mt-1 h-5 text-sm text-(--dash-ash) tabular-nums">
          {other ? `≈ ${other.replace(/^≈ /, "")}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PAD.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onPress(key)}
            disabled={
              key === "." &&
              (unit === "fiat" ? fiatDecimals(fiat.currency) === 0 : false)
            }
            aria-label={
              key === "back"
                ? "Delete last digit"
                : key === "."
                  ? "Decimal point"
                  : key
            }
            className={`flex h-16 items-center justify-center rounded-(--dash-radius-sm) border border-(--dash-line) text-2xl tabular-nums transition-colors select-none hover:bg-(--dash-tint) active:bg-(--dash-tint) disabled:opacity-30 ${dashFocus}`}
          >
            {key === "back" ? (
              <Delete className="size-6" aria-hidden="true" />
            ) : (
              key
            )}
          </button>
        ))}
      </div>

      <label className="grid gap-1.5 text-sm font-medium">
        Note (optional)
        <Input
          appearance="linen"
          maxLength={MAX_NOTE_LENGTH}
          placeholder="2 iced coffees"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && amountZat) onCharge();
          }}
        />
        <span className="text-xs font-normal text-(--dash-ash)">
          The customer&apos;s wallet shows it with the payment.
        </span>
      </label>

      <button
        type="button"
        className={`${dashButtonPrimary} h-12 w-full`}
        disabled={!amountZat}
        onClick={onCharge}
      >
        {!amountZat
          ? "Enter an amount"
          : unit === "fiat"
            ? `Charge ${formatFiatPrice(Number(value.replace(/\.$/, "")), fiat.currency)}`
            : `Charge ${zatToZec(amountZat)} ZEC`}
      </button>
    </div>
  );
}

function PaidView({
  sale,
  paidZat,
  fiat,
  onNext,
}: {
  sale: Sale;
  paidZat: bigint;
  fiat: Fiat;
  onNext: () => void;
}) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const over = paidZat - BigInt(sale.amountZat);
  return (
    <div
      className="grid justify-items-center gap-5 py-6 text-center"
      role="status"
    >
      <span className="flex size-20 items-center justify-center rounded-full bg-(--dash-fg) text-(--dash-surface)">
        <Check className="size-10" aria-hidden="true" />
      </span>
      <div>
        <p className="text-4xl tracking-tight">Paid</p>
        <p className="mt-3 text-2xl tabular-nums">{zatToZec(paidZat)} ZEC</p>
        <p className="mt-1 text-sm text-(--dash-ash)">
          {sale.fiat
            ? formatFiatPrice(sale.fiat.amount, sale.fiat.code)
            : fiat.format(paidZat)}
          {sale.note ? ` · ${sale.note}` : ""}
        </p>
        {over > 0n ? (
          <p className="mt-2 text-xs text-(--dash-ash)">
            The customer paid {zatToZec(over)} ZEC more than asked.
          </p>
        ) : null}
      </div>
      <button
        ref={nextRef}
        type="button"
        className={`${dashButtonPrimary} h-12 px-8`}
        onClick={onNext}
      >
        New sale
      </button>
    </div>
  );
}

function SalesPanel({
  sales,
  payments,
  today,
  fiat,
  currentId,
  saveError,
  onResume,
}: {
  sales: Sale[];
  payments: ReturnType<typeof salePayments>;
  today: { zat: bigint; count: number };
  fiat: Fiat;
  currentId: string | null;
  saveError: string;
  onResume: (sale: Sale) => void;
}) {
  const recent = sales.slice(0, 25);
  function exportCsv() {
    const day = new Date().toISOString().slice(0, 10);
    downloadText(`sales-${day}.csv`, salesCsv(sales, payments), "text/csv");
  }
  return (
    <div className={dashLedger}>
      <section className={`${dashCell} p-5`}>
        <h2 className="dashboard-tile-title">Today</h2>
        <p className="mt-3 text-2xl tabular-nums">{zatToZec(today.zat)} ZEC</p>
        <p className="mt-1 text-xs text-(--dash-ash)">
          {[
            fiat.format(today.zat),
            `${today.count} ${today.count === 1 ? "sale" : "sales"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>
      <section className={dashCell}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="dashboard-tile-title">Recent sales</h2>
          <button
            type="button"
            className={dashIconButton}
            onClick={exportCsv}
            disabled={!sales.length}
            aria-label="Export sales as CSV"
            title="Export CSV"
          >
            <Download aria-hidden="true" />
          </button>
        </div>
        {saveError ? (
          <p className="px-5 pt-3 text-xs text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}
        {recent.length ? (
          <ul className="mt-3 divide-y divide-(--dash-line)">
            {recent.map((sale) => {
              const payment = payments.get(sale.id);
              const status = saleStatus(sale, payment);
              const open = status !== "paid" && sale.id !== currentId;
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {sale.fiat
                        ? formatFiatPrice(sale.fiat.amount, sale.fiat.code)
                        : `${zatToZec(BigInt(sale.amountZat))} ZEC`}
                      {sale.note ? (
                        <span className="text-(--dash-ash)">
                          {" "}
                          · {sale.note}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-(--dash-ash)">
                      {new Date(sale.createdAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      status === "paid"
                        ? "text-(--dash-fg)"
                        : "text-(--dash-ash)"
                    }`}
                  >
                    {sale.id === currentId && status !== "paid"
                      ? "On screen"
                      : STATUS_LABEL[status]}
                  </span>
                </>
              );
              return (
                <li key={sale.id}>
                  {open ? (
                    <button
                      type="button"
                      onClick={() => onResume(sale)}
                      className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-(--dash-tint) ${dashFocus}`}
                      title="Show this sale's QR code again"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-5 py-3">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 pt-3 pb-5 text-sm text-(--dash-ash)">
            No sales yet. Each sale you charge shows up here, and stays only on
            this device.
          </p>
        )}
        {recent.length ? <div className="h-2" /> : null}
      </section>
    </div>
  );
}
