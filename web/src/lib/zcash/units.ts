// 1 ZEC = 10^8 zatoshi. Amounts are bigint zatoshi everywhere except UI text.
export const ZAT_PER_ZEC = 100_000_000n;
const ZEC_PATTERN = /^\d+(\.\d{1,8})?$/;

/** Parses a decimal ZEC string ("0.8", "12.00000001") into zatoshi. */
export function zecToZat(value: string): bigint {
  const v = value.trim();
  if (!ZEC_PATTERN.test(v))
    throw new Error("Enter a ZEC amount with up to 8 decimals.");
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole) * ZAT_PER_ZEC + BigInt(frac.padEnd(8, "0"));
}

/** Formats zatoshi as a ZEC decimal string without trailing zeros. */
export function zatToZec(zat: bigint): string {
  const sign = zat < 0n ? "-" : "";
  const abs = zat < 0n ? -zat : zat;
  const whole = abs / ZAT_PER_ZEC;
  const frac = (abs % ZAT_PER_ZEC)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}
