import { describeTx } from "../src/features/zcash/describeTx";
import {
  filterHistory,
  historyCsv,
  isFiltered,
  NO_FILTER,
} from "../src/features/zcash/historyFilter";
import { csvSafe, toCsv } from "../src/lib/csv";
import type { WalletTx } from "../src/lib/zcash/wallet";

const at = (day: string, hour = 12) =>
  new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).getTime();

const tx = (over: Partial<WalletTx>): WalletTx => ({
  txid: "a".repeat(64),
  kind: "received",
  value: 100_000_000n,
  fee: null,
  height: 10,
  confirmations: 1,
  pending: false,
  memos: [],
  timestamp: at("2026-10-10"),
  pool: "orchard",
  ...over,
});

const history = [
  tx({ txid: `1${"0".repeat(63)}`, memos: ["Rent for October"] }),
  tx({
    txid: `2${"0".repeat(63)}`,
    kind: "sent",
    value: -25_000_000n,
    fee: 10_000n,
    timestamp: at("2026-10-20", 23),
  }),
  tx({
    txid: `3${"0".repeat(63)}`,
    memos: ["zua:pos:abcdefgh1234 2 iced coffees"],
    value: 2_500_000n,
    timestamp: at("2026-10-21", 0),
  }),
  tx({
    txid: `4${"0".repeat(63)}`,
    pending: true,
    height: null,
    timestamp: null,
  }),
];
const ids = (rows: WalletTx[]) => rows.map((t) => t.txid[0]);

describe("history filters", () => {
  it("shows everything without filters", () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(ids(filterHistory(history, NO_FILTER))).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("searches labels, notes, amounts and txids", () => {
    const find = (query: string) =>
      ids(filterHistory(history, { ...NO_FILTER, query }));
    expect(find("rent")).toEqual(["1"]);
    expect(find("coffee")).toEqual(["3"]);
    expect(find("sale")).toEqual(["3"]);
    expect(find("0.25")).toEqual(["2"]);
    expect(find("3000")).toEqual(["3"]);
  });

  it("filters by kind and inclusive local days", () => {
    expect(ids(filterHistory(history, { ...NO_FILTER, kind: "sent" }))).toEqual(
      ["2"],
    );
    const days = { ...NO_FILTER, from: "2026-10-20", to: "2026-10-20" };
    expect(isFiltered(days)).toBe(true);
    expect(ids(filterHistory(history, days))).toEqual(["2"]);
    expect(
      ids(filterHistory(history, { ...NO_FILTER, from: "2026-10-21" })),
    ).toEqual(["3"]);
  });
});

describe("history CSV", () => {
  it("exports signed amounts, labels and status", () => {
    const [header, sent, pending] = historyCsv([history[1], history[3]])
      .trim()
      .split("\n");
    expect(header).toBe(
      "date,type,amount_zec,fee_zec,description,memo,status,block,txid",
    );
    expect(sent).toContain(",sent,-0.25,0.0001,Sent,,confirmed,10,2");
    expect(pending).toMatch(/^,received,1,,Received,,confirming,,4/);
  });

  it("defuses payer memos a spreadsheet would run", () => {
    expect(csvSafe('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(csvSafe("-0.25")).toBe("-0.25");
    expect(csvSafe("@sum")).toBe("'@sum");
    expect(toCsv([["=1+1", "a,b", "-1"]])).toBe(`'=1+1,"a,b",-1\n`);
  });
});

describe("describeTx", () => {
  it("adds the note written after an app tag", () => {
    expect(describeTx(history[2])).toBe("Sale · 2 iced coffees");
    expect(describeTx(tx({ memos: ["zua:inv:abcdefgh1234"] }))).toBe(
      "Invoice payment",
    );
  });
});
