import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { requireUsername } from "../profiles/profiles.service";
import { ClaimLinkNotFoundError } from "./claimLinks.errors";
import {
  claimLinkIdInput,
  createClaimLinkInput,
  markFundedInput,
} from "./claimLinks.schema";
import {
  cancelClaimLink,
  createClaimLink,
  listClaimLinks,
  markClaimLinkFunded,
} from "./claimLinks.service";

function mapError(e: unknown): never {
  if (e instanceof ClaimLinkNotFoundError)
    throw new TRPCError({ code: "NOT_FOUND", message: e.message });
  throw e;
}

// The server only keeps the sender's list (amount, note, key index). The key
// and the link never reach it.
export const claimLinksRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createClaimLinkInput)
    .mutation(async ({ ctx, input }) =>
      createClaimLink(await requireUsername(ctx.privyUserId), input).catch(
        mapError,
      ),
    ),
  markFunded: protectedProcedure
    .input(markFundedInput)
    .mutation(async ({ ctx, input }) =>
      markClaimLinkFunded(
        await requireUsername(ctx.privyUserId),
        input.id,
        input.txid,
      ).catch(mapError),
    ),
  cancel: protectedProcedure
    .input(claimLinkIdInput)
    .mutation(async ({ ctx, input }) =>
      cancelClaimLink(await requireUsername(ctx.privyUserId), input.id).catch(
        mapError,
      ),
    ),
  list: protectedProcedure.query(async ({ ctx }) =>
    listClaimLinks(await requireUsername(ctx.privyUserId)),
  ),
});
