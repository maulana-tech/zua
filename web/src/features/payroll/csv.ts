// Payroll rows from a CSV the user exported from a spreadsheet:
//   recipient,amount,memo
//   @dinar,1.25,October retainer
//   u1…,0.5,
// A header row is optional. Quoted cells may contain commas and "" quotes.

export type PayrollRow = { recipient: string; amount: string; memo: string };

export const MAX_PAYROLL_ROWS = 50;

function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parsePayrollCsv(text: string): PayrollRow[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const rows = lines.map(cells);
  if (rows[0] && /^recipient$/i.test(rows[0][0] ?? "")) rows.shift();
  if (rows.length > MAX_PAYROLL_ROWS)
    throw new Error(
      `Up to ${MAX_PAYROLL_ROWS} payments fit in one batch; split the file.`,
    );
  return rows.map(([recipient = "", amount = "", memo = ""], i) => {
    if (!recipient || !amount)
      throw new Error(`Row ${i + 1} needs a recipient and an amount.`);
    return { recipient, amount, memo };
  });
}

export function payrollCsv(rows: PayrollRow[]): string {
  const cell = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  return [
    "recipient,amount,memo",
    ...rows.map((r) => [r.recipient, r.amount, r.memo].map(cell).join(",")),
  ].join("\n");
}
