// People and addresses this account has paid, kept only in the device vault
// (lib/vault) so the server never learns who pays whom. A @username contact
// is re-resolved and its signature re-checked on every send.
export type Contact = {
  /** "@dinar" or the address itself. */
  key: string;
  username: string | null;
  address: string;
  /** Name the user gave an address; usernames show as "@name". */
  name: string;
  lastPaidAt: number;
  payments: number;
};

export const CONTACTS_RECORD = "contacts";
export const MAX_CONTACTS = 50;
export const MAX_CONTACT_NAME = 40;

export function contactKey(r: { username: string | null; address: string }) {
  return r.username ? `@${r.username}` : r.address;
}

/** What to put in the "To" field to pay this contact again. */
export function contactTarget(c: Contact): string {
  return c.username ? `@${c.username}` : c.address;
}

export function shortAddress(address: string): string {
  return address.length > 18
    ? `${address.slice(0, 10)}…${address.slice(-6)}`
    : address;
}

export function contactLabel(c: Contact): string {
  if (c.username) return `@${c.username}`;
  return c.name || shortAddress(c.address);
}

/** Records a payment: moves the contact to the front, adding it if new. */
export function recordPayment(
  contacts: Contact[],
  to: { username: string | null; address: string },
  now: number,
): Contact[] {
  const key = contactKey(to);
  const existing = contacts.find((c) => c.key === key);
  const next: Contact = {
    key,
    username: to.username,
    address: to.address,
    name: existing?.name ?? "",
    lastPaidAt: now,
    payments: (existing?.payments ?? 0) + 1,
  };
  return [next, ...contacts.filter((c) => c.key !== key)].slice(
    0,
    MAX_CONTACTS,
  );
}

export function nameContact(
  contacts: Contact[],
  key: string,
  name: string,
): Contact[] {
  const clean = name.trim().slice(0, MAX_CONTACT_NAME);
  return contacts.map((c) => (c.key === key ? { ...c, name: clean } : c));
}

export function forgetContact(contacts: Contact[], key: string): Contact[] {
  return contacts.filter((c) => c.key !== key);
}

/** Contacts matching what's typed in "To" (all of them when it's empty). */
export function matchContacts(contacts: Contact[], query: string): Contact[] {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return contacts;
  return contacts.filter(
    (c) =>
      c.username?.startsWith(q) ||
      c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().startsWith(q),
  );
}
