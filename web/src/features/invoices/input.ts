import { z } from "zod";
import { zecToZat } from "../../lib/zcash/units";
import type { InvoiceState } from "./types";

const MAX_ZAT = 21_000_000n * 100_000_000n;

const unitPrice = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,8})?$/, "Use a ZEC price with up to 8 decimals.");

const line = z
  .object({
    description: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(10000),
    unitPrice,
  })
  .strict();

export function invoiceTotal(
  items: { quantity: number; unitPrice: string }[],
): bigint {
  return items.reduce(
    (total, item) => total + BigInt(item.quantity) * zecToZat(item.unitPrice),
    0n,
  );
}

export const invoiceInput = z
  .object({
    number: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9._/-]{0,39}$/, "Enter an invoice number."),
    clientName: z.string().trim().min(1).max(120),
    clientEmail: z
      .union([z.string().trim().email().max(200), z.literal("")])
      .optional()
      .transform((v) => v || null),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const date = new Date(`${v}T00:00:00Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === v
        );
      }, "Choose a valid due date."),
    notes: z.string().trim().max(1000).default(""),
    items: z.array(line).min(1).max(25),
    // Own diversified address for this invoice, signed by the owner.
    payAddress: z
      .object({
        claimJson: z.string().min(10).max(1000),
        sigHex: z.string().regex(/^[0-9a-f]{128}$/),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => {
    try {
      const total = invoiceTotal(v.items);
      return total > 0n && total <= MAX_ZAT;
    } catch {
      return false;
    }
  }, "Invoice total must be positive and within the supported range.");

export type InvoiceInput = z.input<typeof invoiceInput>;

export function invoiceStatus(
  status: InvoiceState,
  dueDate: string,
  now = new Date(),
) {
  return status === "pending" && now.toISOString().slice(0, 10) > dueDate
    ? "overdue"
    : status;
}

export const invoiceToken = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
export const invoiceId = z.string().regex(/^[0-9A-Za-z]{8,24}$/);
export const txidSchema = z.string().regex(/^[0-9a-f]{64}$/);
