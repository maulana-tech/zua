import { describe, expect, it } from "vitest";
import {
  type ReceiptBody,
  type ReceiptItem,
  signReceipt,
  sumZat,
} from "../src/features/receipts/receipt";
import {
  type VerifyDeps,
  verifyReceipt,
} from "../src/features/receipts/verify";
import { signAddressClaim } from "../src/lib/addressClaim";
import {
  canonicalClaim,
  type ProfileClaim,
  signClaim,
  signingPubkeyHex,
} from "../src/lib/profileClaim";
import { profileSigningSeed } from "../src/lib/zcash/seed";
import { FULL, ORCHARD_ONLY, OTHER } from "./helpers/unifiedAddresses";

// A tiny fake chain: one transaction whose outputs open with known keys.
const TXID = "aa".repeat(32);
const people = {
  dinar: profileSigningSeed(new Uint8Array(32).fill(1)),
  mallory: profileSigningSeed(new Uint8Array(32).fill(2)),
};
const profileOf = (username: keyof typeof people): ProfileClaim => ({
  v: 1,
  username,
  network: "main",
  ua: `u1profile${username}xxxxxx`,
  birthday: 1,
  signPubkeyHex: signingPubkeyHex(people[username]),
  msgPubkeyHex: "ab".repeat(32),
  issuedAt: "2026-10-15T00:00:00.000Z",
});

const INVOICE_UA = "u1dinarinvoiceaddressxx";
const invoiceAddress = signAddressClaim(
  {
    v: 1,
    username: "dinar",
    network: "main",
    ua: INVOICE_UA,
    issuedAt: "2026-10-15T00:00:00.000Z",
  },
  people.dinar,
);

// Output 0 pays Dinar's invoice address 5 ZEC with an invoice memo.
const OUTPUTS: Record<string, { ua: string; value: bigint; memo: string }> = {
  [`ironwood:0:${"11".repeat(32)}`]: {
    ua: INVOICE_UA,
    value: 500_000_000n,
    memo: "zua:inv:INV0000001",
  },
};

const deps: VerifyDeps = {
  network: "main",
  async profile(username) {
    if (!(username in people)) return null;
    const claim = profileOf(username as keyof typeof people);
    return {
      claimJson: canonicalClaim(claim),
      claimSigHex: signClaim(claim, people[username as keyof typeof people]),
    };
  },
  async addressOwner(ua) {
    if (ua === INVOICE_UA) return { username: "dinar", signed: invoiceAddress };
    for (const name of Object.keys(people) as (keyof typeof people)[])
      if (profileOf(name).ua === ua) return { username: name, signed: null };
    return null;
  },
  async rawTransaction(txid) {
    return txid === TXID ? { data: new Uint8Array([1]), height: 100 } : null;
  },
  async latestHeight() {
    return 109;
  },
  async verifyDisclosure({ pool, action, kEnc, ua }) {
    const out = OUTPUTS[`${pool}:${action}:${kEnc}`];
    if (!out || out.ua !== ua) throw new Error("does not decrypt");
    return { value: out.value, memo: out.memo };
  },
};

const item: ReceiptItem = {
  txid: TXID,
  height: 100,
  amountZat: "500000000",
  memo: "zua:inv:INV0000001",
  recipientUa: INVOICE_UA,
  disclosures: [{ pool: "ironwood", action: 0, kEnc: "11".repeat(32) }],
};

const receipt = (
  signer: keyof typeof people,
  patch: Partial<ReceiptBody> = {},
) => {
  const items = patch.items ?? [item];
  return signReceipt(
    {
      v: 3,
      kind: "received",
      network: "main",
      signer,
      period: null,
      items,
      totalZat: sumZat(items),
      issuedAt: "2026-10-15T00:00:00.000Z",
      ...patch,
    },
    people[signer],
  );
};

describe("verifying receipts", () => {
  it("proves a payment to the signer's per-invoice address", async () => {
    const result = await verifyReceipt(receipt("dinar"), deps);
    expect(result).toMatchObject({
      status: "verified",
      totalZat: 500_000_000n,
    });
    if (result.status === "verified")
      expect(result.items[0]).toMatchObject({
        confirmations: 10,
        recipient: "dinar",
        memo: "zua:inv:INV0000001",
      });
  });

  it("stops a payer from passing someone else's payment off as income", async () => {
    // Mallory paid Dinar and knows K_enc, but the address is Dinar's.
    const result = await verifyReceipt(receipt("mallory"), deps);
    expect(result).toMatchObject({ status: "invalid" });
  });

  it("lets the payer issue a proof of payment naming the recipient", async () => {
    const result = await verifyReceipt(
      receipt("mallory", { kind: "sent" }),
      deps,
    );
    expect(result).toMatchObject({ status: "verified" });
    if (result.status === "verified")
      expect(result.items[0].recipient).toBe("dinar");
  });

  it("rejects wrong amounts, memos, keys, blocks and networks", async () => {
    const edited = (patch: Partial<ReceiptItem>) =>
      verifyReceipt(receipt("dinar", { items: [{ ...item, ...patch }] }), deps);
    expect(await edited({ amountZat: "600000000" })).toMatchObject({
      status: "invalid",
    });
    expect(await edited({ memo: "zua:inv:OTHER00001" })).toMatchObject({
      status: "invalid",
    });
    expect(
      await edited({
        disclosures: [{ pool: "ironwood", action: 0, kEnc: "22".repeat(32) }],
      }),
    ).toMatchObject({ status: "invalid" });
    expect(await edited({ height: 101 })).toMatchObject({ status: "invalid" });
    expect(
      await verifyReceipt(receipt("dinar"), { ...deps, network: "test" }),
    ).toMatchObject({ status: "invalid" });
  });

  it("rejects a listed output twice (double counting a statement)", async () => {
    const result = await verifyReceipt(
      receipt("dinar", {
        kind: "statement",
        period: { from: "2026-10-01", to: "2026-10-31" },
        items: [item, item],
      }),
      deps,
    );
    expect(result).toMatchObject({ status: "invalid" });
  });

  it("counts a payment to the profile address, named in its Orchard-only form", async () => {
    // Wallets report an output by its Orchard receiver, not the full address.
    const claim = { ...profileOf("dinar"), ua: FULL };
    const viaProfile = (owned: string): VerifyDeps => ({
      ...deps,
      async profile(username) {
        return username === "dinar"
          ? {
              claimJson: canonicalClaim(claim),
              claimSigHex: signClaim(claim, people.dinar),
            }
          : deps.profile(username);
      },
      // A server could claim any address is Dinar's; the verifier checks it
      // against her signed profile.
      async addressOwner(ua) {
        return ua === owned ? { username: "dinar", signed: null } : null;
      },
      async verifyDisclosure() {
        return { value: 500_000_000n, memo: "" };
      },
    });
    const paidTo = (recipientUa: string) =>
      receipt("dinar", { items: [{ ...item, memo: "", recipientUa }] });

    expect(
      await verifyReceipt(paidTo(ORCHARD_ONLY), viaProfile(ORCHARD_ONLY)),
    ).toMatchObject({ status: "verified" });
    expect(await verifyReceipt(paidTo(OTHER), viaProfile(OTHER))).toMatchObject(
      { status: "invalid" },
    );
  });

  it("reports the network being unreachable separately", async () => {
    const result = await verifyReceipt(receipt("dinar"), {
      ...deps,
      latestHeight: () => Promise.reject(new Error("offline")),
    });
    expect(result).toEqual({ status: "unavailable", reason: "offline" });
  });
});
