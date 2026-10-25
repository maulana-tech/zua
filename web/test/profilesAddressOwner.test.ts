import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FULL,
  ORCHARD_ONLY,
  OTHER,
  SECOND_FULL,
  SECOND_ORCHARD_ONLY,
} from "./helpers/unifiedAddresses";

// The verifier asks who registered an address; a payment to a profile comes
// back as its Orchard-only form (skipped when no MongoDB is reachable).
const URI = process.env.ZUA_TEST_MONGODB_URI ?? "mongodb://localhost:27017";
const DB = `zua_test_${randomUUID().replaceAll("-", "")}`;

const { mongoAvailable } = await import("./helpers/mongoTestDb");
const available = await mongoAvailable();

describe.skipIf(!available)("addressOwner (MongoDB)", () => {
  let service: typeof import("../src/server/modules/profiles/profiles.service");
  let mongo: typeof import("../src/server/db/mongo");

  beforeAll(async () => {
    process.env.MONGODB_URI = `${URI.replace(/\/$/, "")}/${DB}`;
    mongo = await import("../src/server/db/mongo");
    service = await import("../src/server/modules/profiles/profiles.service");
    await (await mongo.getProfiles()).insertOne({
      _id: "kopisenja",
      userId: "u1",
      network: "test",
      ua: FULL,
      orchardUa: ORCHARD_ONLY,
      birthday: 1,
      signPubkeyHex: "",
      msgPubkeyHex: "",
      claimJson: "{}",
      claimSigHex: "",
      createdAt: new Date(),
    });
    // A per-link address that happens to carry a Sapling receiver too.
    await (await mongo.getPayAddresses()).insertOne({
      _id: SECOND_FULL,
      orchardUa: SECOND_ORCHARD_ONLY,
      owner: "kopisenja",
      claimJson: "{}",
      sigHex: "",
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    const db = await mongo.getDb();
    if (db.databaseName.startsWith("zua_test_")) await db.dropDatabase();
  });

  it("finds a profile by its full or Orchard-only address", async () => {
    const owner = { username: "kopisenja", signed: null };
    expect(await service.addressOwner(FULL)).toEqual(owner);
    expect(await service.addressOwner(ORCHARD_ONLY)).toEqual(owner);
  });

  it("finds a pay address by its full or Orchard-only address", async () => {
    const owner = {
      username: "kopisenja",
      signed: { claimJson: "{}", sigHex: "" },
    };
    expect(await service.addressOwner(SECOND_FULL)).toEqual(owner);
    expect(await service.addressOwner(SECOND_ORCHARD_ONLY)).toEqual(owner);
  });

  it("doesn't match another address of the same wallet", async () => {
    expect(await service.addressOwner(OTHER)).toBeNull();
  });
});
