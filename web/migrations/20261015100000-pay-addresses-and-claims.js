// Per-invoice/link addresses (owner registry), claim links, recurring and
// USD invoices.
export const up = async (db) => {
  await db
    .collection("pay_addresses")
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
