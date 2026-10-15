// Per-invoice/link addresses (owner registry), claim links, recurring and
// USD invoices.
export const up = async (db) => {
  await db
    .collection("pay_addresses")
    .createIndex({ owner: 1, createdAt: -1 }, { name: "by_owner" });
};

export const down = async (db) => {
  await db
    .collection("pay_addresses")
    .dropIndexes()
    .catch(() => {});
};
