import "server-only";
import { randomBytes } from "node:crypto";
import type { MongoServerError } from "mongodb";
import { invoiceTotal } from "../../../features/invoices/input";
import {
  type Currency,
  centsToUsd,
  priceMicro,
  QUOTE_GRACE_MS,
  QUOTE_TTL_MS,
  quoteZat,
  usdToCents,
} from "../../../features/invoices/money";
import {
  nextDay,
  nextIssueAt,
  type Recurrence,
} from "../../../features/invoices/recurrence";
import type { InvoiceView } from "../../../features/invoices/types";
import { newMemoId } from "../../../lib/zcash/memo";
import { zatToZec, zecToZat } from "../../../lib/zcash/units";
import {
  getInvoices,
  getProfiles,
  type InvoiceDoc,
  type InvoiceQuote,
} from "../../db/mongo";
import { zecUsd } from "../../lib/zecPrice";
import {
  emailInvoiceReminder,
  emailNewInvoice,
} from "../notifications/notifications.service";
import { checkPayAddress } from "../profiles/profiles.service";
import {
  InvoiceClosedError,
  InvoiceNotFoundError,
  InvoiceNumberTakenError,
  QuoteUnavailableError,
} from "./invoices.errors";

type CreateInput = {
  number: string;
  clientName: string;
  clientEmail: string | null;
  dueDate: string;
  notes: string;
  items: { description: string; quantity: number; unitPrice: string }[];
  currency?: Currency;
  recurrence?: Recurrence;
  payAddress?: { claimJson: string; sigHex: string };
};

function latestQuote(doc: InvoiceDoc): InvoiceView["quote"] {
  const q = doc.quotes?.at(-1);
  return q
    ? {
        zat: q.zat,
        usdPerZec: Number(q.priceMicro) / 1_000_000,
        expiresAt: q.expiresAt.toISOString(),
      }
    : null;
}

/** ZEC needed to settle: the invoice total, or for USD invoices the lowest
 *  quote issued in the grace window (a payer may pay a quote they were shown
 *  just before it was refreshed). */
function requiredZat(doc: InvoiceDoc, now: Date): bigint {
  if (doc.currency !== "USD") return BigInt(doc.totalZat);
  const recent = (doc.quotes ?? []).filter(
    (q) => q.expiresAt.getTime() >= now.getTime() - QUOTE_GRACE_MS,
  );
  // Past the grace window the latest quote applies; with no quote at all the
  // payer never saw a ZEC amount, so nothing settles it.
  if (!recent.length) {
    const latest = doc.quotes?.at(-1);
    return latest ? BigInt(latest.zat) : 2n ** 63n;
  }
  return recent.reduce(
    (min, q) => (BigInt(q.zat) < min ? BigInt(q.zat) : min),
    BigInt(recent[0].zat),
  );
}

async function toView(doc: InvoiceDoc): Promise<InvoiceView> {
  const profile = await (await getProfiles()).findOne({ _id: doc.owner });
  return {
    id: doc._id,
    token: doc.token,
    username: doc.owner,
    ua: profile?.ua ?? "",
    payAddress: doc.payAddress ?? null,
    number: doc.number,
    clientName: doc.clientName,
    items: doc.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice:
        doc.currency === "USD"
          ? centsToUsd(BigInt(i.unitCents ?? "0")).replace(/[$,]/g, "")
          : zatToZec(BigInt(i.unitZat)),
    })),
    currency: doc.currency ?? "ZEC",
    totalUsd:
      doc.currency === "USD" ? centsToUsd(BigInt(doc.totalCents ?? "0")) : null,
    quote: latestQuote(doc),
    totalZat: doc.totalZat,
    totalZec: zatToZec(BigInt(doc.totalZat)),
    paidZat: doc.paidZat,
    notes: doc.notes,
    dueDate: doc.dueDate,
    status: doc.status,
    recurrence: doc.recurrence ?? "none",
    nextIssueAt: doc.nextIssueAt?.toISOString() ?? null,
    paidTxids: doc.paidTxids,
    paidReportedAt: doc.paidReportedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function createInvoice(
  owner: string,
  input: CreateInput,
): Promise<InvoiceView> {
  const payAddress = input.payAddress
    ? await checkPayAddress(owner, input.payAddress)
    : null;
  const usd = input.currency === "USD";
  const now = new Date();
  const doc: InvoiceDoc = {
    _id: newMemoId(),
    owner,
    number: input.number,
    token: randomBytes(24).toString("base64url"),
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    items: input.items.map((i) =>
      usd
        ? {
            description: i.description,
            quantity: i.quantity,
            unitZat: "0",
            unitCents: usdToCents(i.unitPrice).toString(),
          }
        : {
            description: i.description,
            quantity: i.quantity,
            unitZat: zecToZat(i.unitPrice).toString(),
          },
    ),
    // USD invoices get their ZEC amount from a quote when a payer opens them.
    totalZat: usd ? "0" : invoiceTotal(input.items).toString(),
    currency: input.currency ?? "ZEC",
    totalCents: usd ? invoiceTotal(input.items, "USD").toString() : null,
    quotes: [],
    payAddress,
    notes: input.notes,
    dueDate: input.dueDate,
    status: "pending",
    recurrence: input.recurrence ?? "none",
    nextIssueAt: nextIssueAt(now, input.recurrence ?? "none"),
    seriesNumber: input.number,
    seriesIndex: 1,
    reminderSentAt: null,
    paidZat: "0",
    paidTxids: [],
    paidReportedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await (await getInvoices()).insertOne(doc);
  } catch (e) {
    if ((e as MongoServerError).code === 11000)
      throw new InvoiceNumberTakenError();
    throw e;
  }
  return toView(doc);
}

/**
 * Issues the next invoice of every series that is due (all owners, or one).
 * The schedule moves to the new invoice; claiming the due one atomically
 * keeps a cron run and a dashboard visit from issuing it twice.
 */
export async function issueDueRecurring(
  now = new Date(),
  owner?: string,
): Promise<{ invoice: InvoiceView; clientEmail: string | null }[]> {
  const invoices = await getInvoices();
  const issued: { invoice: InvoiceView; clientEmail: string | null }[] = [];
  for (;;) {
    const due = await invoices.findOneAndUpdate(
      {
        ...(owner ? { owner } : {}),
        recurrence: { $in: ["weekly", "monthly"] },
        nextIssueAt: { $lte: now },
        status: { $ne: "void" },
      },
      { $set: { recurrence: "none", nextIssueAt: null, updatedAt: now } },
      { returnDocument: "before" },
    );
    if (!due) break;
    const recurrence = due.recurrence ?? "none";
    const index = (due.seriesIndex ?? 1) + 1;
    const series = due.seriesNumber ?? due.number;
    const issuedAt = due.nextIssueAt ?? now;
    const child: InvoiceDoc = {
      _id: newMemoId(),
      owner: due.owner,
      number: `${series}-${index}`,
      token: randomBytes(24).toString("base64url"),
      clientName: due.clientName,
      clientEmail: due.clientEmail,
      items: due.items,
      // A USD series gets a fresh quote for each invoice.
      totalZat: due.currency === "USD" ? "0" : due.totalZat,
      currency: due.currency ?? "ZEC",
      totalCents: due.totalCents ?? null,
      quotes: [],
      // Same signed address as the series: the server can't sign new ones.
      payAddress: due.payAddress ?? null,
      notes: due.notes,
      dueDate: nextDay(due.dueDate, recurrence),
      status: "pending",
      recurrence,
      nextIssueAt: nextIssueAt(issuedAt, recurrence),
      seriesNumber: series,
      seriesIndex: index,
      reminderSentAt: null,
      paidZat: "0",
      paidTxids: [],
      paidReportedAt: null,
      createdAt: issuedAt,
      updatedAt: now,
    };
    try {
      await invoices.insertOne(child).catch(async (e) => {
        // The owner already used this number by hand: keep it unique.
        if ((e as MongoServerError).code !== 11000) throw e;
        child.number = `${series}-${index}-${child._id.slice(0, 4)}`;
        await invoices.insertOne(child);
      });
    } catch (e) {
      // Put the schedule back so the next run retries.
      await invoices.updateOne(
        { _id: due._id },
        { $set: { recurrence, nextIssueAt: due.nextIssueAt ?? null } },
      );
      throw e;
    }
    issued.push({
      invoice: await toView(child),
      clientEmail: child.clientEmail,
    });
  }
  return issued;
}

/** Overdue, unpaid invoices whose client hasn't been reminded yet. */
export async function claimDueReminders(
  now = new Date(),
  owner?: string,
): Promise<{ invoice: InvoiceView; clientEmail: string }[]> {
  const invoices = await getInvoices();
  const today = now.toISOString().slice(0, 10);
  const out: { invoice: InvoiceView; clientEmail: string }[] = [];
  for (;;) {
    const doc = await invoices.findOneAndUpdate(
      {
        ...(owner ? { owner } : {}),
        status: "pending",
        dueDate: { $lt: today },
        clientEmail: { $ne: null },
        reminderSentAt: null, // also matches invoices from before reminders
      },
      { $set: { reminderSentAt: now } },
      { returnDocument: "after" },
    );
    if (!doc?.clientEmail) break;
    out.push({ invoice: await toView(doc), clientEmail: doc.clientEmail });
  }
  return out;
}

export async function stopRecurring(owner: string, id: string) {
  const doc = await (await getInvoices()).findOneAndUpdate(
    { _id: id, owner },
    { $set: { recurrence: "none", nextIssueAt: null, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new InvoiceNotFoundError();
  return toView(doc);
}

export async function listInvoices(owner: string): Promise<InvoiceView[]> {
  // Catch up on this owner's schedule even if the cron hasn't run.
  await runInvoiceSchedule(new Date(), owner).catch(() => {});
  const docs = await (await getInvoices())
    .find({ owner })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  return Promise.all(docs.map(toView));
}

export async function voidInvoice(owner: string, id: string) {
  const doc = await (await getInvoices()).findOneAndUpdate(
    { _id: id, owner, status: "pending" },
    { $set: { status: "void", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new InvoiceClosedError();
  return toView(doc);
}

/**
 * The owner's wallet found payments whose memo tags this invoice. The server
 * cannot see shielded payments, so it records what the owner reports.
 */
export async function reportPayment(
  owner: string,
  input: { id: string; txids: string[]; paidZat: string },
): Promise<{ invoice: InvoiceView; becamePaid: boolean }> {
  const invoices = await getInvoices();
  const current = await invoices.findOne({ _id: input.id, owner });
  if (!current) throw new InvoiceNotFoundError();
  if (current.status === "void") throw new InvoiceClosedError();
  const paid = BigInt(input.paidZat);
  const status = paid >= requiredZat(current, new Date()) ? "paid" : "pending";
  const doc = await invoices.findOneAndUpdate(
    { _id: input.id, owner },
    {
      $set: {
        paidZat: paid.toString(),
        paidTxids: [...new Set(input.txids)].slice(0, 50),
        status,
        paidReportedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!doc) throw new InvoiceNotFoundError();
  return {
    invoice: await toView(doc),
    becamePaid: current.status !== "paid" && status === "paid",
  };
}

export async function publicInvoice(
  token: string,
): Promise<InvoiceView | null> {
  const doc = await (await getInvoices()).findOne({ token });
  return doc ? toView(doc) : null;
}

export async function invoiceClientEmail(id: string): Promise<string | null> {
  return (
    (await (await getInvoices()).findOne({ _id: id }))?.clientEmail ?? null
  );
}

/**
 * The schedule job: issue due recurring invoices and remind clients of
 * overdue ones, by email when configured. Run by the cron route for
 * everyone and when an owner opens their invoices.
 */
export async function runInvoiceSchedule(now = new Date(), owner?: string) {
  const issued = await issueDueRecurring(now, owner);
  const reminders = await claimDueReminders(now, owner);
  await Promise.allSettled([
    ...issued.flatMap(({ invoice, clientEmail }) =>
      clientEmail ? [emailNewInvoice(invoice, clientEmail)] : [],
    ),
    ...reminders.map(({ invoice, clientEmail }) =>
      emailInvoiceReminder(invoice, clientEmail),
    ),
  ]);
  return { issued: issued.length, reminded: reminders.length };
}

/**
 * Public: locks the ZEC amount of a pending USD invoice for QUOTE_TTL_MS.
 * Reuses a live quote; once a payment is reported the quote is frozen, so a
 * partial payment is completed at the same rate.
 */
export async function quoteInvoice(token: string): Promise<InvoiceView | null> {
  const invoices = await getInvoices();
  const doc = await invoices.findOne({ token });
  if (!doc) return null;
  const now = new Date();
  const live = doc.quotes?.at(-1);
  if (
    doc.currency !== "USD" ||
    doc.status !== "pending" ||
    BigInt(doc.paidZat) > 0n ||
    (live && live.expiresAt > now)
  )
    return toView(doc);
  const price = await zecUsd();
  if (!price) throw new QuoteUnavailableError();
  const micro = priceMicro(price.usd);
  const zat = quoteZat(BigInt(doc.totalCents ?? "0"), micro).toString();
  const quote: InvoiceQuote = {
    zat,
    priceMicro: micro.toString(),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
  };
  // Only replace the quote that was stale when we read it (no double quotes).
  const updated = await invoices.findOneAndUpdate(
    {
      _id: doc._id,
      status: "pending",
      paidZat: doc.paidZat,
      ...(live ? { "quotes.expiresAt": live.expiresAt } : {}),
    },
    {
      $push: { quotes: { $each: [quote], $slice: -10 } },
      $set: { totalZat: zat, updatedAt: now },
    },
    { returnDocument: "after" },
  );
  return toView(updated ?? (await invoices.findOne({ _id: doc._id })) ?? doc);
}
