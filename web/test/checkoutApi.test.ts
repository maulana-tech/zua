import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyWebhook } from "../src/features/developer/signature";
import { signAddressClaim } from "../src/lib/addressClaim";
import {
  canonicalClaim,
  type ProfileClaim,
  signClaim,
  signingPubkeyHex,
} from "../src/lib/profileClaim";
import { profileSigningSeed } from "../src/lib/zcash/seed";

// The merchant Checkout API end to end against a real MongoDB (skipped when
// none is reachable): keys, the address pool, the REST routes and signed
// webhooks to a local HTTP server.
const URI = process.env.ZUA_TEST_MONGODB_URI ?? "mongodb://localhost:27017";
const DB = `zua_test_${randomUUID().replaceAll("-", "")}`;
const { mongoAvailable } = await import("./helpers/mongoTestDb");
const available = await mongoAvailable();

const seed = profileSigningSeed(new Uint8Array(32).fill(4));
const ua = (tag: string) => `u1${tag}${"qp".repeat(60)}`;
const profile: ProfileClaim = {
  v: 1,
  username: "shop",
  network: "main",
  ua: ua("profile"),
  birthday: 1,
  signPubkeyHex: signingPubkeyHex(seed),
  msgPubkeyHex: "ab".repeat(32),
  issuedAt: "2026-10-15T00:00:00.000Z",
};
const spare = (n: number) =>
  signAddressClaim(
    {
      v: 1,
      username: "shop",
      network: "main",
      ua: ua(`spare${"xyz"[n]}`), // bech32 charset: no 1, b, i, o
      issuedAt: "2026-10-15T00:00:00.000Z",
    },
    seed,
  );

describe.skipIf(!available)("checkout API (MongoDB)", () => {
  let dev: typeof import("../src/server/modules/developer/developer.service");
  let invoices: typeof import("../src/server/modules/invoices/invoices.service");
  let checkoutsRoute: typeof import("../src/app/api/v1/checkouts/route");
  let checkoutRoute: typeof import("../src/app/api/v1/checkouts/[id]/route");
  let mongo: typeof import("../src/server/db/mongo");
  let server: Server;
  let hookUrl = "";
  const received: { body: string; signature: string }[] = [];
  let failNext = 0;

  beforeAll(async () => {
    process.env.MONGODB_URI = `${URI.replace(/\/$/, "")}/${DB}`;
    process.env.NEXT_PUBLIC_ZCASH_NETWORK = "main";
    mongo = await import("../src/server/db/mongo");
    dev = await import("../src/server/modules/developer/developer.service");
    invoices = await import("../src/server/modules/invoices/invoices.service");
    checkoutsRoute = await import("../src/app/api/v1/checkouts/route");
    checkoutRoute = await import("../src/app/api/v1/checkouts/[id]/route");
    await (await mongo.getProfiles()).insertOne({
      _id: "shop",
      userId: "u-shop",
      network: "main",
      ua: profile.ua,
      birthday: 1,
      signPubkeyHex: profile.signPubkeyHex,
      msgPubkeyHex: profile.msgPubkeyHex,
      claimJson: canonicalClaim(profile),
      claimSigHex: signClaim(profile, seed),
      createdAt: new Date(),
    });
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        if (failNext > 0) {
          failNext--;
          res.writeHead(500).end();
          return;
        }
        received.push({
          body,
          signature: String(req.headers["zua-signature"]),
        });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  });

  afterAll(async () => {
    server?.close();
    const db = await mongo.getDb();
    if (db.databaseName.startsWith("zua_test_")) await db.dropDatabase();
  });

  const post = (key: string | null, body: unknown) =>
    checkoutsRoute.POST(
      new Request("http://zua.test/api/v1/checkouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    );

  it("authenticates keys and stops revoked ones", async () => {
    const { key, id } = await dev.createApiKey("shop", "test");
    expect(key).toMatch(/^zua_sk_[0-9a-f]{12}_[A-Za-z0-9_-]{32}$/);
    expect(await dev.authenticateApiKey(`Bearer ${key}`)).toMatchObject({
      owner: "shop",
    });
    expect(await dev.authenticateApiKey(`Bearer ${key}x`)).toBeNull();
    expect(
      await dev.authenticateApiKey(`Bearer ${key.slice(0, -1)}A`),
    ).toBeNull();
    await dev.revokeApiKey("shop", id);
    expect(await dev.authenticateApiKey(`Bearer ${key}`)).toBeNull();
    expect((await post(key, { amount: "1" })).status).toBe(401);
  });

  it("creates checkouts with pooled addresses, then the profile address", async () => {
    const { key } = await dev.createApiKey("shop", "server");
    expect(
      (await dev.addPoolAddresses("shop", [spare(1), spare(2)])).unused,
    ).toBe(2);
    // An address signed by someone else can't enter the pool.
    const other = signAddressClaim(
      {
        v: 1,
        username: "shop",
        network: "main",
        ua: ua("mallet"),
        issuedAt: "x",
      },
      profileSigningSeed(new Uint8Array(32).fill(9)),
    );
    await expect(dev.addPoolAddresses("shop", [other])).rejects.toThrow();

    const bad = await post(key, { amount: "1.234", currency: "USD" });
    expect(bad.status).toBe(400);
    expect((await post(key, { amount: "1", junk: true })).status).toBe(400);

    const res = await post(key, {
      amount: "25.00",
      currency: "USD",
      reference: "order_1042",
      description: "Coffee x2",
    });
    expect(res.status).toBe(201);
    const checkout = await res.json();
    expect(checkout).toMatchObject({
      object: "checkout",
      status: "open",
      currency: "USD",
      amount: "25.00",
      amount_zat: null, // USD: no quote yet
      reference: "order_1042",
    });
    expect(checkout.url).toMatch(/\/i\/[A-Za-z0-9_-]{32}$/);
    const inv = await (await mongo.getInvoices()).findOne({ _id: checkout.id });
    expect(inv?.payAddress?.claimJson).toContain("sparey");
    expect((await dev.poolStatus("shop")).unused).toBe(1);

    const got = await checkoutRoute.GET(
      new Request(`http://zua.test/api/v1/checkouts/${checkout.id}`, {
        headers: { Authorization: `Bearer ${key}` },
      }),
      { params: Promise.resolve({ id: checkout.id }) },
    );
    expect((await got.json()).id).toBe(checkout.id);

    await post(key, { amount: "1" }); // takes spare 2
    const third = await (await post(key, { amount: "1" })).json();
    const thirdDoc = await (await mongo.getInvoices()).findOne({
      _id: third.id,
    });
    expect(thirdDoc?.payAddress ?? null).toBeNull(); // pool empty: profile UA
  });

  it("signs webhooks and retries failures", async () => {
    const { secret } = await dev.setWebhook("shop", hookUrl);
    const inv = await invoices.createInvoice("shop", {
      number: "WH-1",
      clientName: "A",
      clientEmail: null,
      dueDate: "2026-12-01",
      notes: "",
      items: [{ description: "x", quantity: 1, unitPrice: "1" }],
      source: "api",
      reference: "order_7",
    });
    const noSleep = async () => {};
    failNext = 2; // two 500s, then success on the third try
    const delivery = await dev.deliverEvent(
      "shop",
      "checkout.paid",
      { id: inv.id, reference: "order_7" },
      noSleep,
    );
    expect(delivery).toMatchObject({ status: "delivered", attempts: 3 });
    const last = received.at(-1);
    expect(last && verifyWebhook(secret, last.body, last.signature)).toBe(true);
    expect(JSON.parse(last?.body ?? "{}")).toMatchObject({
      type: "checkout.paid",
      data: { reference: "order_7" },
    });

    failNext = 3;
    const failed = await dev.deliverEvent("shop", "test", {}, noSleep);
    expect(failed).toMatchObject({ status: "failed", attempts: 3 });
    await expect(dev.setWebhook("shop", "ftp://nope")).rejects.toThrow();
  });
});
