// Initial schema for the Zcash app: one account per Privy identity, signed
// public profiles, payment links, invoices and email notifications.
export const up = async (db) => {
  await db
    .collection("profiles")
    .createIndex({ userId: 1 }, { unique: true, name: "one_profile_per_user" });
  await db
    .collection("profiles")
    .createIndex({ ua: 1 }, { unique: true, name: "unique_address" });
  await db
    .collection("payment_links")
    .createIndex({ owner: 1, slug: 1 }, { unique: true, name: "owner_slug" });
  await db
    .collection("payment_links")
    .createIndex({ owner: 1, createdAt: -1 }, { name: "owner_recent" });
  await db
    .collection("invoices")
    .createIndex(
      { owner: 1, number: 1 },
      { unique: true, name: "owner_number" },
    );
  await db
    .collection("invoices")
    .createIndex({ token: 1 }, { unique: true, name: "public_token" });
  await db
    .collection("invoices")
    .createIndex({ owner: 1, createdAt: -1 }, { name: "owner_recent" });
  await db
    .collection("notification_settings")
    .createIndex(
      { unsubscribeToken: 1 },
      { unique: true, name: "unsubscribe_token" },
    );
};

export const down = async (db) => {
  for (const name of [
    "profiles",
    "payment_links",
    "invoices",
    "notification_settings",
  ]) {
    await db
      .collection(name)
      .dropIndexes()
      .catch(() => {});
  }
};
