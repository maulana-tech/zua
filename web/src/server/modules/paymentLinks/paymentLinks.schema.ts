import { z } from "zod";
import { zatToZec, zecToZat } from "../../../lib/zcash/units";
import {
  signedAddressInput,
  usernameSchema,
} from "../profiles/profiles.schema";

const MAX_ZAT = 21_000_000n * 100_000_000n;

/** Decimal ZEC string in, zatoshi string out; empty means "payer chooses". */
export const zecAmountInput = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value == null || value.trim() === "") return null;
    try {
      const zat = zecToZat(value);
      if (zat <= 0n || zat > MAX_ZAT) throw new Error("out of range");
      return zat.toString();
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a ZEC amount, e.g. 0.25.",
      });
      return z.NEVER;
    }
  });

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters.")
  .max(48, "Use 48 characters or fewer.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens.",
  );

const text = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null(), z.undefined()])
    .transform((v) => (v ? v : null));

export const createLinkInput = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(1, "Give the link a title.").max(80),
    description: text(500),
    amount: zecAmountInput,
    payAddress: signedAddressInput.optional(),
  })
  .strict();

export const updateLinkInput = z
  .object({
    id: z.string().min(8).max(24),
    title: z.string().trim().min(1).max(80),
    description: text(500),
    amount: zecAmountInput,
  })
  .strict();

export const archiveLinkInput = z
  .object({ id: z.string().min(8).max(24), archived: z.boolean() })
  .strict();

export const resolveLinkInput = z
  .object({ owner: usernameSchema, slug: slugSchema })
  .strict();

export const linkOutput = z.object({
  id: z.string(),
  owner: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  amountZat: z.string().nullable(),
  amountZec: z.string().nullable(),
  payAddress: z
    .object({ claimJson: z.string(), sigHex: z.string() })
    .nullable(),
  state: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const toZec = (zat: string | null) =>
  zat ? zatToZec(BigInt(zat)) : null;

export type CreateLinkInput = z.infer<typeof createLinkInput>;
export type UpdateLinkInput = z.infer<typeof updateLinkInput>;
export type ArchiveLinkInput = z.infer<typeof archiveLinkInput>;
export type ResolveLinkInput = z.infer<typeof resolveLinkInput>;
export type LinkOutput = z.infer<typeof linkOutput>;
