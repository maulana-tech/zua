import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  invoiceId,
  invoiceInput,
  invoiceToken,
  txidSchema,
} from "../../../features/invoices/input";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../trpc";
import {
  emailInvoiceClient,
  notifyInvoicePaid,
} from "../notifications/notifications.service";
import { requireUsername } from "../profiles/profiles.service";
import {
  InvoiceClosedError,
  InvoiceNotFoundError,
  InvoiceNumberTakenError,
} from "./invoices.errors";
import {
  createInvoice,
  invoiceClientEmail,
  listInvoices,
  publicInvoice,
  reportPayment,
  voidInvoice,
} from "./invoices.service";

function mapError(e: unknown): never {
  if (e instanceof InvoiceNumberTakenError || e instanceof InvoiceClosedError)
    throw new TRPCError({ code: "CONFLICT", message: e.message });
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
  reportPayment: protectedProcedure
    .input(
      z
        .object({
          id: invoiceId,
          txids: z.array(txidSchema).min(1).max(50),
          paidZat: z.string().regex(/^\d{1,17}$/),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const owner = await requireUsername(ctx.privyUserId);
      const result = await reportPayment(owner, input).catch(mapError);
      if (result.becamePaid) {
        void notifyInvoicePaid(ctx.privyUserId, result.invoice).catch(() => {});
        void invoiceClientEmail(input.id)
          .then((email) =>
            email ? emailInvoiceClient(result.invoice, email) : undefined,
          )
          .catch(() => {});
      }
      return result.invoice;
    }),
  public: publicProcedure
    .input(z.object({ token: invoiceToken }).strict())
    .query(({ input }) => publicInvoice(input.token)),
});
