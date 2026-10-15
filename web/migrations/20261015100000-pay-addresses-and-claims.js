// Per-invoice/link addresses (owner registry and API pool), claim links,
// recurring and USD invoices, API keys and webhook deliveries.
export const up = async (db) => {
  await db
    .collection("pay_addresses")
    .createIndex({ owner: 1, createdAt: -1 }, { name: "by_owner" });
  await db
    .collection("pay_addresses")
    .createIndex({ owner: 1, pooled: 1, usedFor: 1 }, { name: "pool" });
  await db
    .collection("api_keys")
    .createIndex({ owner: 1, createdAt: -1 }, { name: "by_owner" });
  await db
    .collection("webhook_deliveries")
    .createIndex({ owner: 1, createdAt: -1 }, { name: "by_owner" });
  await db
    .collection("claim_links")
    .createIndex({ owner: 1, createdAt: -1 }, { name: "by_owner" });
  const invoices = db.collection("invoices");
  await invoices.createIndex(
    { recurrence: 1, nextIssueAt: 1 },
    { name: "recurring_due" },
  );
  await invoices.createIndex(
    { status: 1, dueDate: 1, reminderSentAt: 1 },
    { name: "reminders_due" },
  );
};

export const down = async (db) => {
  for (const name of ["api_keys", "webhook_deliveries"])
    await db
      .collection(name)
      .dropIndexes()
      .catch(() => {});
  await db
    .collection("claim_links")
    .dropIndexes()
    .catch(() => {});
  for (const name of ["recurring_due", "reminders_due"])
    await db
      .collection("invoices")
      .dropIndex(name)
      .catch(() => {});
  await db
    .collection("pay_addresses")
    .dropIndexes()
    .catch(() => {});
};
