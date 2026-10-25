import {
  type Contact,
  contactLabel,
  contactTarget,
  forgetContact,
  MAX_CONTACTS,
  matchContacts,
  nameContact,
  recordPayment,
} from "../src/features/contacts/contacts";

const UA = "u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzzzzzz";

describe("contacts", () => {
  it("puts the latest recipient first and counts repeat payments", () => {
    let list: Contact[] = [];
    list = recordPayment(list, { username: "dinar", address: UA }, 1);
    list = recordPayment(list, { username: null, address: UA }, 2);
    list = recordPayment(list, { username: "dinar", address: UA }, 3);
    expect(list.map((c) => c.key)).toEqual(["@dinar", UA]);
    expect(list[0]).toMatchObject({ payments: 2, lastPaidAt: 3 });
    expect(contactTarget(list[0])).toBe("@dinar");
    expect(contactTarget(list[1])).toBe(UA);
  });

  it("names addresses, keeps the name on later payments, and forgets", () => {
    let list = recordPayment([], { username: null, address: UA }, 1);
    expect(contactLabel(list[0])).toBe("u1qqqqqqqq…zzzzzz");
    list = nameContact(list, UA, "  My exchange  ");
    list = recordPayment(list, { username: null, address: UA }, 2);
    expect(contactLabel(list[0])).toBe("My exchange");
    expect(forgetContact(list, UA)).toEqual([]);
  });

  it("filters by what's typed and stays bounded", () => {
    let list: Contact[] = [];
    for (let i = 0; i < MAX_CONTACTS + 3; i++)
      list = recordPayment(list, { username: `user${i}`, address: UA }, i);
    expect(list).toHaveLength(MAX_CONTACTS);
    expect(matchContacts(list, "@user5").map((c) => c.username)).toEqual([
      "user52",
      "user51",
      "user50",
      "user5",
    ]);
    expect(matchContacts(list, "")).toHaveLength(MAX_CONTACTS);
  });
});
