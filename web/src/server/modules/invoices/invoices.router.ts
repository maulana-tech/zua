import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getServerEnv } from "../../../env.server";
import {
  invoiceId,
  invoiceInput,
  invoiceToken,
} from "../../../features/invoices/input";
import { rateLimit } from "../../lib/rateLimit";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../trpc";
import { toCheckout } from "../developer/checkouts";
import { deliverEvent } from "../developer/developer.service";
import {
  emailInvoiceClient,
  notifyInvoicePaid,
} from "../notifications/notifications.service";
import { InvalidPayAddressError } from "../profiles/profiles.errors";
import { requireUsername } from "../profiles/profiles.service";
import {
  InvoiceClosedError,
  InvoiceNotFoundError,
  InvoiceNumberTakenError,
  QuoteUnavailableError,
} from "./invoices.errors";
import {
  createInvoice,
  invoiceClientEmail,
  listInvoices,
  publicInvoice,
  quoteInvoice,
  reportPayment,
  stopRecurring,
  voidInvoice,
} from "./invoices.service";

function mapError(e: unknown): never {
  if (e instanceof InvalidPayAddressError)
    throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
  if (e instanceof InvoiceNumberTakenError || e instanceof InvoiceClosedError)
    throw new TRPCError({ code: "CONFLICT", message: e.message });
  if (e instanceof QuoteUnavailableError)
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: e.message });
  if (e instanceof InvoiceNotFoundError)
    throw new TRPCError({ code: "NOT_FOUND", message: e.message });
  throw e;
}

export const invoicesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(invoiceInput)
    .mutation(async ({ ctx, input }) =>
      createInvoice(await requireUsername(ctx.privyUserId), input).catch(
        mapError,
      ),
    ),
  list: protectedProcedure.query(async ({ ctx }) =>
    listInvoices(await requireUsername(ctx.privyUserId)),
  ),
  void: protectedProcedure
    .input(z.object({ id: invoiceId }).strict())
    .mutation(async ({ ctx, input }) =>
      voidInvoice(await requireUsername(ctx.privyUserId), input.id).catch(
        mapError,
      ),
    ),
  stopRecurring: protectedProcedure
    .input(z.object({ id: invoiceId }).strict())
    .mutation(async ({ ctx, input }) =>
      stopRecurring(await requireUsername(ctx.privyUserId), input.id).catch(
        mapError,
      ),
    ),
  reportPayment: protectedProcedure
    .input(
      z
        .object({
          id: invoiceId,
          paidZat: z.string().regex(/^\d{1,17}$/),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const owner = await requireUsername(ctx.privyUserId);
      const result = await reportPayment(owner, input).catch(mapError);
      if (result.becamePaid) {
        void notifyInvoicePaid(ctx.privyUserId, result.invoice).catch(() => {});
        // Signed webhook to the merchant's server, if they set one up.
        void deliverEvent(
          owner,
          result.invoice.source === "api" ? "checkout.paid" : "invoice.paid",
          toCheckout(
            result.invoice,
            (getServerEnv().APP_URL || "http://localhost:3000").replace(
              /\/$/,
              "",
            ),
          ),
        ).catch(() => {});
        void invoiceClientEmail(input.id)
          .then((email) =>
            email ? emailInvoiceClient(result.invoice, email) : undefined,
          )
          .catch(() => {});
      }
      return result.invoice;
    }),
  /** Locks the ZEC amount of a USD invoice for 30 minutes. */
  quote: publicProcedure
    .input(z.object({ token: invoiceToken }).strict())
    .mutation(async ({ ctx, input }) => {
      if (!rateLimit(`invoice-quote:${ctx.ip ?? "unknown"}`, 30, 60_000).ok)
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      return quoteInvoice(input.token).catch(mapError);
    }),
  public: publicProcedure
    .input(z.object({ token: invoiceToken }).strict())
    .query(({ input }) => publicInvoice(input.token)),
});
