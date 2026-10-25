// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PosDashboard } from "../src/components/pos/PosDashboard";
import { displayTyped, padKeyFor, pressKey } from "../src/features/pos/keypad";
import {
  addSale,
  dayTotal,
  MAX_SALES,
  type Sale,
  saleMemo,
  salePayments,
  saleStatus,
  salesCsv,
} from "../src/features/pos/sales";
import { parseMemoTag } from "../src/lib/zcash/memo";
import type { WalletTx } from "../src/lib/zcash/wallet";

const { wallet, stopWatching } = vi.hoisted(() => {
  const stopWatching = vi.fn();
  return {
    stopWatching,
    wallet: {
      accountUnlocked: true,
      promptUnlock: vi.fn(),
      recoveryMethod: "pin",
      username: "kopi",
      businessName: "Kopi Senja",
      zcash: {
        status: "ready",
        address: "utest1shop",
        balances: null,
        history: [] as WalletTx[],
        sync: null,
        lastSyncedAt: null,
        error: null,
      },
      watchPayments: vi.fn(() => stopWatching),
      loadLocal: vi.fn(async () => null),
      saveLocal: vi.fn(async (_name: string, _value: unknown) => {}),
    },
  };
});

vi.mock("../src/components/WalletProvider", () => ({
  useWallet: () => wallet,
}));

// 1 ZEC = Rp 1.000.000, so Rp 25.000 is 0.025 ZEC.
vi.mock("../src/features/zcash/useZecPrice", () => ({
  useFiat: () => ({
    currency: "IDR",
    rate: 1_000_000,
    format: (zat: bigint) => `≈ IDR ${Number(zat) / 100}`,
    formatAmount: (n: number) => `IDR ${n}`,
    toZat: (n: number) => BigInt(Math.round((n / 1_000_000) * 1e8)),
  }),
}));

const tx = (over: Partial<WalletTx>): WalletTx => ({
  txid: "t",
  kind: "received",
  value: 100n,
  fee: null,
  height: 10,
  confirmations: 1,
  pending: false,
  memos: [],
  timestamp: 1_000,
  pool: "orchard",
  ...over,
});

const sale = (over: Partial<Sale>): Sale => ({
  id: "abcdefgh1234",
  amountZat: "1000",
  fiat: null,
  note: "",
  createdAt: new Date(2026, 9, 25, 10).getTime(),
  cancelled: false,
  ...over,
});

describe("POS keypad", () => {
  it("builds a decimal amount within the currency's decimals", () => {
    let v = "";
    for (const k of ["0", "0", "1", ".", "2", "5", "9"] as const)
      v = pressKey(v, k, 2);
    expect(v).toBe("1.25");
    expect(pressKey("", ".", 2)).toBe("0.");
    expect(pressKey("25000", ".", 0)).toBe("25000");
    expect(pressKey("1.2", "back", 2)).toBe("1.");
    expect(pressKey("1.2", "clear", 2)).toBe("");
    expect(pressKey("999999999999", "9", 0)).toBe("999999999999");
  });

  it("maps keyboard keys and formats what was typed", () => {
    expect(padKeyFor("7")).toBe("7");
    expect(padKeyFor(",")).toBe(".");
    expect(padKeyFor("Backspace")).toBe("back");
    expect(padKeyFor("a")).toBeNull();
    expect(displayTyped("", "en-US")).toBe("0");
    expect(displayTyped("1250.5", "en-US")).toBe("1,250.5");
    expect(displayTyped("1250.", "id-ID")).toBe("1.250,");
  });
});

describe("POS sales", () => {
  it("tags the memo and keeps the note readable", () => {
    const memo = saleMemo({ id: "abcdefgh1234", note: "2 iced coffees" });
    expect(memo).toBe("zua:pos:abcdefgh1234 2 iced coffees");
    expect(parseMemoTag(memo)).toEqual({ kind: "pos", id: "abcdefgh1234" });
  });

  it("sums tagged payments per sale and derives the status", () => {
    const history = [
      tx({ txid: "a", value: 400n, memos: ["zua:pos:abcdefgh1234"] }),
      tx({ txid: "a", value: 400n, memos: ["zua:pos:abcdefgh1234"] }),
      tx({ txid: "b", value: 50n, memos: ["zua:inv:abcdefgh1234"] }),
      tx({
        txid: "c",
        kind: "sent",
        value: -9n,
        memos: ["zua:pos:abcdefgh1234"],
      }),
    ];
    const payments = salePayments(history);
    expect(payments.get("abcdefgh1234")?.paidZat).toBe(400n);
    expect(saleStatus(sale({}), payments.get("abcdefgh1234"))).toBe("partial");

    payments.set("abcdefgh1234", { paidZat: 1000n, txids: [], paidAt: null });
    expect(
      saleStatus(sale({ cancelled: true }), payments.get("abcdefgh1234")),
    ).toBe("paid");
    expect(saleStatus(sale({ cancelled: true }), undefined)).toBe("cancelled");
    expect(saleStatus(sale({}), undefined)).toBe("waiting");
  });

  it("totals today's paid sales and exports a CSV", () => {
    const day = new Date(2026, 9, 25, 18).getTime();
    const sales = [
      sale({ id: "aaaaaaaa1111", note: 'Latte, "large"' }),
      sale({ id: "bbbbbbbb2222" }),
      sale({ id: "cccccccc3333", createdAt: new Date(2026, 9, 24).getTime() }),
    ];
    const payments = new Map([
      ["aaaaaaaa1111", { paidZat: 1000n, txids: ["x"], paidAt: 1 }],
      ["cccccccc3333", { paidZat: 1000n, txids: ["y"], paidAt: 1 }],
    ]);
    expect(dayTotal(sales, payments, day)).toEqual({ zat: 1000n, count: 1 });
    const csv = salesCsv(sales, payments).split("\n");
    expect(csv[0]).toBe(
      "date,sale,amount_zec,paid_zec,status,fiat,fiat_amount,note",
    );
    expect(csv[1]).toContain(
      ',aaaaaaaa1111,0.00001,0.00001,paid,,,"Latte, ""large"""',
    );
    expect(csv[2]).toContain(",waiting,");
  });

  it("keeps the log newest first and bounded", () => {
    let sales: Sale[] = [];
    for (let i = 0; i < MAX_SALES + 5; i++)
      sales = addSale(sales, sale({ id: `id${String(i).padStart(10, "0")}` }));
    expect(sales).toHaveLength(MAX_SALES);
    expect(sales[0].id).toBe(`id${String(MAX_SALES + 4).padStart(10, "0")}`);
  });
});

describe("PosDashboard", () => {
  it("charges in rupiah and shows the sale as paid once it lands", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PosDashboard />);
    expect(await screen.findByText("Kopi Senja")).toBeTruthy();
    await screen.findByRole("button", { name: "Enter an amount" });

    for (const key of ["2", "5", "0", "0", "0"])
      await user.click(screen.getByRole("button", { name: key }));
    expect(screen.getByText("≈ 0.025 ZEC")).toBeTruthy();
    await user.type(screen.getByLabelText(/Note/), "2 iced coffees");
    await user.click(screen.getByRole("button", { name: /^Charge / }));

    expect(screen.getByText("Scan to pay")).toBeTruthy();
    expect(screen.getByText("0.025 ZEC")).toBeTruthy();
    expect(wallet.watchPayments).toHaveBeenCalledTimes(1);
    const saved = wallet.saveLocal.mock.calls.at(-1)?.[1] as Sale[];
    expect(saved[0]).toMatchObject({
      amountZat: "2500000",
      fiat: { code: "IDR", amount: 25000 },
      note: "2 iced coffees",
    });

    wallet.zcash = {
      ...wallet.zcash,
      history: [
        tx({ txid: "paid", value: 2_500_000n, memos: [saleMemo(saved[0])] }),
      ],
    };
    rerender(<PosDashboard />);
    const next = await screen.findByRole("button", { name: "New sale" });
    expect(screen.getByRole("status")).toHaveTextContent(/Paid/);
    expect(stopWatching).toHaveBeenCalled();
    await user.click(next);
    expect(
      screen.getByRole("button", { name: "Enter an amount" }),
    ).toBeTruthy();
  });
});
