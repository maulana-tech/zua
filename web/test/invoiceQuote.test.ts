import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// USD invoices against a real MongoDB (skipped when none is reachable):
// quotes lock a ZEC amount, a payment freezes it, settlement uses it.
const URI = process.env.ZUA_TEST_MONGODB_URI ?? "mongodb://localhost:27017";
const DB = `zua_test_${randomUUID().replaceAll("-", "")}`;
let usdPerZec = 50;
vi.mock("../src/server/lib/zecPrice", () => ({
  zecUsd: async () => ({ usd: usdPerZec, fetchedAt: Date.now() }),
}));

const { mongoAvailable } = await import("./helpers/mongoTestDb");
const available = await mongoAvailable();

describe.skipIf(!available)("USD invoices (MongoDB)", () => {
  let service: typeof import("../src/server/modules/invoices/invoices.service");
  let mongo: typeof import("../src/server/db/mongo");

  beforeAll(async () => {
    process.env.MONGODB_URI = `${URI.replace(/\/$/, "")}/${DB}`;
    mongo = await import("../src/server/db/mongo");
    service = await import("../src/server/modules/invoices/invoices.service");
    await (await mongo.getProfiles()).insertOne({
      _id: "dinar",
      userId: "u1",
      network: "main",
      ua: "u1profile",
      birthday: 1,
      signPubkeyHex: "",
      msgPubkeyHex: "",
      claimJson: "{}",
      claimSigHex: "",
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    const db = await mongo.getDb();
    if (db.databaseName.startsWith("zua_test_")) await db.dropDatabase();
  });

  const create = (number: string) =>
    service.createInvoice("dinar", {
      number,
      clientName: "Acme",
      clientEmail: null,
      dueDate: "2026-12-01",
      notes: "",
      items: [{ description: "Design", quantity: 2, unitPrice: "25" }],
      currency: "USD",
    });

  it("stores dollars and has no ZEC amount until quoted", async () => {
    const inv = await create("USD-1");
    expect(inv).toMatchObject({
      currency: "USD",
      totalUsd: "$50.00",
      totalZat: "0",
      quote: null,
    });
    expect(inv.items[0].unitPrice).toBe("25.00");
    // A memo-tagged payment before any quote settles nothing.
    const { invoice } = await service.reportPayment("dinar", {
      id: inv.id,
      paidZat: "999999999",
    });
    expect(invoice.status).toBe("pending");
  });

  it("never stores or exposes the paying transaction", async () => {
    const inv = await create("USD-0");
    await service.quoteInvoice(inv.token);
    await service.reportPayment("dinar", { id: inv.id, paidZat: "100000000" });
    const raw = await (await mongo.getInvoices()).findOne({ _id: inv.id });
    expect(raw).not.toHaveProperty("paidTxids");
    const shown = await service.publicInvoice(inv.token);
    expect(shown?.status).toBe("paid");
    expect(shown).not.toHaveProperty("paidTxids");
  });

  it("locks a quote, reuses it, and settles at it", async () => {
    const inv = await create("USD-2");
    const q1 = await service.quoteInvoice(inv.token);
    expect(q1?.totalZat).toBe("100000000"); // $50 at $50/ZEC
    usdPerZec = 25;
    const q2 = await service.quoteInvoice(inv.token);
    expect(q2?.quote?.expiresAt).toBe(q1?.quote?.expiresAt); // still locked
    expect(q2?.totalZat).toBe("100000000");
    const { invoice } = await service.reportPayment("dinar", {
      id: inv.id,
      paidZat: "100000000",
    });
    expect(invoice.status).toBe("paid");
    usdPerZec = 50;
  });

  it("re-quotes after expiry but freezes once a payment arrives", async () => {
    const inv = await create("USD-3");
    await service.quoteInvoice(inv.token);
    const invoices = await mongo.getInvoices();
    // Expire the quote.
    await invoices.updateOne(
      { _id: inv.id },
      { $set: { "quotes.0.expiresAt": new Date(Date.now() - 1000) } },
    );
    usdPerZec = 100;
    const fresh = await service.quoteInvoice(inv.token);
    expect(fresh?.totalZat).toBe("50000000"); // $50 at $100/ZEC
    // Paying the fresh quote settles it (any quote from the last 24 h does).
    const { invoice } = await service.reportPayment("dinar", {
      id: inv.id,
      paidZat: "50000000",
    });
    expect(invoice.status).toBe("paid");

    const partial = await create("USD-4");
    await service.quoteInvoice(partial.token);
    await service.reportPayment("dinar", {
      id: partial.id,
      paidZat: "10000000",
    });
    await invoices.updateOne(
      { _id: partial.id },
      { $set: { "quotes.0.expiresAt": new Date(Date.now() - 1000) } },
    );
    usdPerZec = 10;
    const frozen = await service.quoteInvoice(partial.token);
    expect(frozen?.totalZat).toBe("50000000"); // unchanged: $50 at $100
    usdPerZec = 50;
  });
});
