// Encrypted payment requests between usernames.
export const up = async (db) => {
  const requests = db.collection("payment_requests");
  await requests.createIndex({ to: 1, createdAt: -1 }, { name: "incoming" });
  await requests.createIndex({ from: 1, createdAt: -1 }, { name: "outgoing" });
  await requests.createIndex(
    { to: 1, status: 1 },
    { name: "pending_incoming" },
  );
};

export const down = async (db) => {
  await db
    .collection("payment_requests")
    .dropIndexes()
    .catch(() => {});
};
