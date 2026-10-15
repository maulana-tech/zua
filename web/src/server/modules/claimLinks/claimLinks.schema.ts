import { z } from "zod";

export const createClaimLinkInput = z
  .object({
    amountZat: z.string().regex(/^[1-9]\d{0,16}$/),
    description: z.string().trim().max(200).default(""),
    birthday: z.number().int().positive(),
  })
  .strict();

export const claimLinkIdInput = z
  .object({ id: z.string().regex(/^[0-9A-Za-z]{8,24}$/) })
  .strict();

export const markFundedInput = claimLinkIdInput.extend({
  txid: z.string().regex(/^[0-9a-f]{64}$/),
});

export type ClaimLinkView = {
  id: string;
  index: number;
  amountZat: string;
  description: string;
  birthday: number;
  fundTxid: string | null;
  state: "funding" | "active" | "cancelled";
  createdAt: string;
};
