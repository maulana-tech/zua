// Invoices and payment requests no longer keep the txids that paid them: next
// to client names and usernames they tied a shielded transaction to people.
// The owner's wallet still knows them; the server only needs the paid total.
export const up = async (db) => {
  for (const name of ["invoices", "payment_requests"])
    await db
      .collection(name)
      .updateMany(
        { paidTxids: { $exists: true } },
        { $unset: { paidTxids: "" } },
      );
};

// The txids are gone for good; nothing reads the field any more.
export const down = async () => {};
