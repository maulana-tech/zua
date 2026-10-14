import "server-only";
import { randomBytes } from "node:crypto";
import type { MongoServerError } from "mongodb";
import { invoiceTotal } from "../../../features/invoices/input";
import type { InvoiceView } from "../../../features/invoices/types";
import { newMemoId } from "../../../lib/zcash/memo";
import { zatToZec, zecToZat } from "../../../lib/zcash/units";
import { getInvoices, getProfiles, type InvoiceDoc } from "../../db/mongo";
import {
  InvoiceClosedError,
  InvoiceNotFoundError,
  InvoiceNumberTakenError,
} from "./invoices.errors";

type CreateInput = {
  number: string;
  clientName: string;
  clientEmail: string | null;
  dueDate: string;
  notes: string;
  items: { description: string; quantity: number; unitPrice: string }[];
};

async function toView(doc: InvoiceDoc): Promise<InvoiceView> {
  const profile = await (await getProfiles()).findOne({ _id: doc.owner });
  return {
    id: doc._id,
    token: doc.token,
    username: doc.owner,
    ua: profile?.ua ?? "",
    number: doc.number,
    clientName: doc.clientName,
    items: doc.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: zatToZec(BigInt(i.unitZat)),
    })),
    totalZat: doc.totalZat,
    totalZec: zatToZec(BigInt(doc.totalZat)),
    paidZat: doc.paidZat,
    notes: doc.notes,
    dueDate: doc.dueDate,
    status: doc.status,
    paidTxids: doc.paidTxids,
    paidReportedAt: doc.paidReportedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function createInvoice(
  owner: string,
  input: CreateInput,
): Promise<InvoiceView> {
  const now = new Date();
  const doc: InvoiceDoc = {
    _id: newMemoId(),
    owner,
    number: input.number,
    token: randomBytes(24).toString("base64url"),
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    items: input.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitZat: zecToZat(i.unitPrice).toString(),
    })),
    totalZat: invoiceTotal(input.items).toString(),
    notes: input.notes,
    dueDate: input.dueDate,
    status: "pending",
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

export async function listInvoices(owner: string): Promise<InvoiceView[]> {
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
  const status = paid >= BigInt(current.totalZat) ? "paid" : "pending";
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
