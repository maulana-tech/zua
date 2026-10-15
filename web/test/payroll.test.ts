import { describe, expect, it } from "vitest";
import {
  MAX_PAYROLL_ROWS,
  parsePayrollCsv,
  payrollCsv,
} from "../src/features/payroll/csv";

describe("payroll CSV", () => {
  it("reads rows with or without a header, quotes and a BOM", () => {
    expect(
      parsePayrollCsv(
        '﻿recipient,amount,memo\r\n@dinar,1.25,"Oct, retainer"\nu1abc,0.5,\n\n',
      ),
    ).toEqual([
      { recipient: "@dinar", amount: "1.25", memo: "Oct, retainer" },
      { recipient: "u1abc", amount: "0.5", memo: "" },
    ]);
    expect(parsePayrollCsv("@a,1")).toEqual([
      { recipient: "@a", amount: "1", memo: "" },
    ]);
  });

  it("round-trips through export", () => {
    const rows = [{ recipient: "@a", amount: "1", memo: 'say "hi", ok' }];
    expect(parsePayrollCsv(payrollCsv(rows))).toEqual(rows);
  });

  it("rejects missing cells and oversized batches", () => {
    expect(() => parsePayrollCsv("@a,")).toThrow(/Row 1/);
    expect(() =>
      parsePayrollCsv(
        Array.from({ length: MAX_PAYROLL_ROWS + 1 }, () => "@a,1").join("\n"),
      ),
    ).toThrow(/split/);
  });
});
