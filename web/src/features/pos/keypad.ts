// The cashier's keypad edits a plain decimal string ("1250.5"); formatting
// for display happens separately so typing never fights the locale.
export type PadKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | "back"
  | "clear";

const MAX_WHOLE_DIGITS = 12;

export function pressKey(value: string, key: PadKey, decimals: number): string {
  if (key === "clear") return "";
  if (key === "back") return value.slice(0, -1);
  const [whole, frac] = value.split(".");
  if (key === ".") {
    if (decimals === 0 || frac !== undefined) return value;
    return `${whole || "0"}.`;
  }
  if (frac !== undefined) return frac.length < decimals ? value + key : value;
  if (whole === "0") return key;
  return whole.length < MAX_WHOLE_DIGITS ? value + key : value;
}

/** The key a physical keyboard press means, if any. */
export function padKeyFor(key: string): PadKey | null {
  if (/^[0-9]$/.test(key)) return key as PadKey;
  if (key === "." || key === ",") return ".";
  if (key === "Backspace") return "back";
  if (key === "Escape" || key === "Delete") return "clear";
  return null;
}

/** "1250.5" with the locale's separators ("1.250,5" in id-ID). */
export function displayTyped(value: string, locale?: string): string {
  if (!value) return "0";
  const parts = new Intl.NumberFormat(locale).formatToParts(1000.5);
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  const [whole, frac] = value.split(".");
  const grouped = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(BigInt(whole || "0"));
  return frac === undefined ? grouped : `${grouped}${decimal}${frac}`;
}
