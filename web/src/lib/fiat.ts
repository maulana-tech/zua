// Currencies Zua can show ZEC amounts in ("≈ Rp 215.727"). Display only:
// payments are always in ZEC, and USD invoices keep their own quotes.
export const FIAT_CURRENCIES = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "PHP", name: "Philippine peso" },
  { code: "THB", name: "Thai baht" },
  { code: "VND", name: "Vietnamese dong" },
  { code: "INR", name: "Indian rupee" },
  { code: "JPY", name: "Japanese yen" },
  { code: "KRW", name: "South Korean won" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "TWD", name: "New Taiwan dollar" },
  { code: "AUD", name: "Australian dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "CHF", name: "Swiss franc" },
  { code: "AED", name: "UAE dirham" },
  { code: "TRY", name: "Turkish lira" },
  { code: "BRL", name: "Brazilian real" },
  { code: "MXN", name: "Mexican peso" },
  { code: "NGN", name: "Nigerian naira" },
  { code: "ZAR", name: "South African rand" },
] as const;

export type FiatCode = (typeof FIAT_CURRENCIES)[number]["code"];

const CODES = new Set<string>(FIAT_CURRENCIES.map((c) => c.code));

export function isFiatCode(code: unknown): code is FiatCode {
  return typeof code === "string" && CODES.has(code);
}

// Country → currency, for a sensible default from the browser's locale.
const REGION_CURRENCY: Record<string, FiatCode> = {
  US: "USD",
  GB: "GBP",
  ID: "IDR",
  SG: "SGD",
  MY: "MYR",
  PH: "PHP",
  TH: "THB",
  VN: "VND",
  IN: "INR",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  AU: "AUD",
  CA: "CAD",
  CH: "CHF",
  AE: "AED",
  TR: "TRY",
  BR: "BRL",
  MX: "MXN",
  NG: "NGN",
  ZA: "ZAR",
};
const EURO = new Set(
  "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" "),
);
// Languages that mostly mean one country when the locale has no region.
const LANGUAGE_CURRENCY: Record<string, FiatCode> = {
  id: "IDR",
  ms: "MYR",
  th: "THB",
  vi: "VND",
  ja: "JPY",
  ko: "KRW",
  tr: "TRY",
};

/** The currency a locale like "id-ID" or "en-SG" most likely means. */
export function defaultFiat(locale: string | undefined): FiatCode {
  if (!locale) return "USD";
  const [language, ...rest] = locale.split(/[-_]/);
  const region = rest.find((p) => /^[A-Za-z]{2}$/.test(p))?.toUpperCase();
  if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  if (region && EURO.has(region)) return "EUR";
  return LANGUAGE_CURRENCY[language.toLowerCase()] ?? "USD";
}

/** "Rp 21.572" / "$12.35" / "$1,192": whole units for rupiah and from 1,000 up. */
export function formatFiat(
  amount: number,
  code: FiatCode,
  locale?: string,
): string {
  const whole = amount >= 1000 || code === "IDR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(amount);
}
