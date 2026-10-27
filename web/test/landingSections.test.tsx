// @vitest-environment happy-dom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useWallet: vi.fn(), signIn: vi.fn() }));

vi.mock("../src/components/WalletProvider", () => ({
  useWallet: mocks.useWallet,
}));

import { Developers } from "../src/components/landing/Developers";
import { Exposure } from "../src/components/landing/Exposure";
import { Faq } from "../src/components/landing/Faq";
import { nextTabIndex } from "../src/components/landing/hooks";
import { LiveLedger } from "../src/components/landing/LiveLedger";
import { Pricing } from "../src/components/landing/Pricing";
import { counterPrice } from "../src/components/landing/ProductDemos";
import { FEATURES, ProductSuite } from "../src/components/landing/ProductSuite";
import { priceToZat } from "../src/components/landing/priceMath";
import { UnderTheHood } from "../src/components/landing/UnderTheHood";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useWallet.mockReturnValue({
    authenticated: false,
    signIn: mocks.signIn,
  });
  // 1 ZEC = $50 / €45 for every price lookup.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ usd: 50, rates: { EUR: 45 } }, { status: 200 }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("nextTabIndex", () => {
  it("wraps arrows and jumps with Home/End", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowUp", 1, 3)).toBe(0);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("Enter", 1, 3)).toBeNull();
  });
});

describe("priceToZat", () => {
  const rates = { USD: 50, EUR: 45 };

  it("reads ZEC prices exactly", () => {
    expect(priceToZat("1.5", "ZEC", rates)).toBe(150_000_000n);
    expect(priceToZat("0.00000001", "ZEC", null)).toBe(1n);
  });

  it("converts fiat at the live rate", () => {
    expect(priceToZat("50", "USD", rates)).toBe(100_000_000n);
    expect(priceToZat("9", "EUR", rates)).toBe(20_000_000n);
  });

  it("rejects empty, zero, malformed and unpriced input", () => {
    for (const input of ["", "0", "abc", "1.", "-5", "1e3"])
      expect(priceToZat(input, "ZEC", rates)).toBeNull();
    expect(priceToZat("10", "JPY", rates)).toBeNull();
    expect(priceToZat("10", "USD", null)).toBeNull();
  });
});

describe("counterPrice", () => {
  it("rounds to a price a counter would charge", () => {
    expect(counterPrice(4.37, 2)).toBe("4.50");
    expect(counterPrice(0.1, 2)).toBe("0.50");
    expect(counterPrice(67_890, 0)).toBe("68000");
    expect(counterPrice(0, 2)).toBe("");
  });
});

describe("Exposure", () => {
  it("switches what each observer learns", async () => {
    const user = userEvent.setup();
    render(<Exposure />);
    const tab = screen.getByRole("tab", { name: "Zcash, shielded" });
    expect(
      screen.getByRole("tab", { name: "Transparent chain" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("Anyone can add up your business."),
    ).toBeInTheDocument();

    await user.click(tab);

    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("Observers see that something happened."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Anyone can add up your business."),
    ).not.toBeInTheDocument();
  });
});

describe("ProductSuite", () => {
  it("moves between tools with the arrow keys and Home/End", async () => {
    const user = userEvent.setup();
    render(<ProductSuite />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(FEATURES.length);

    await user.click(tabs[0]);
    await user.keyboard("{ArrowDown}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: FEATURES[1].title }),
    ).toBeInTheDocument();

    await user.keyboard("{End}");
    expect(tabs.at(-1)).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { name: FEATURES.at(-1)?.title }),
    ).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("flags an edited receipt in the receipts demo", async () => {
    const user = userEvent.setup();
    render(<ProductSuite />);
    await user.click(screen.getByRole("tab", { name: "Receipts" }));
    await user.click(screen.getByRole("button", { name: "Edited" }));
    expect(screen.getByText(/The signature doesn.t match/)).toBeInTheDocument();
  });
});

describe("Pricing", () => {
  it("shows the full amount received and no Zua fee", async () => {
    const user = userEvent.setup();
    render(<Pricing />);
    const input = screen.getByLabelText("Your price");
    await screen.findByText(/1 ZEC ≈ \$50/);

    await user.clear(input);
    await user.type(input, "100");

    const received = screen.getByText("You receive").closest("div");
    expect(
      within(received as HTMLElement).getByText("2 ZEC"),
    ).toBeInTheDocument();
    expect(screen.getByText("0.0001 ZEC")).toBeInTheDocument();
    const zuaFee = screen.getByText("Zua fee").closest("div");
    expect(within(zuaFee as HTMLElement).getByText("0")).toBeInTheDocument();
  });

  it("prices directly in ZEC", async () => {
    const user = userEvent.setup();
    render(<Pricing />);
    await user.selectOptions(screen.getByLabelText("Currency"), "ZEC");
    await user.click(screen.getByRole("button", { name: "5 ZEC" }));
    const pays = screen.getByText("Customer pays").closest("div");
    expect(within(pays as HTMLElement).getByText("5 ZEC")).toBeInTheDocument();
  });
});

describe("Faq", () => {
  it("filters questions by topic", async () => {
    const user = userEvent.setup();
    render(<Faq />);
    expect(
      screen.getByRole("button", { name: "Do my clients need to use Zua?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account" }));

    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "Do my clients need to use Zua?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Does Zua hold my money?" }),
    ).toBeInTheDocument();
  });

  it("states the real network fee", async () => {
    const user = userEvent.setup();
    render(<Faq />);
    await user.click(
      screen.getByRole("button", { name: "What does it cost?" }),
    );
    expect(screen.getByText(/0\.0001 ZEC/)).toBeInTheDocument();
    expect(screen.queryByText(/fraction of a cent/)).not.toBeInTheDocument();
  });
});

describe("Developers", () => {
  it("switches code samples and copies the visible one", async () => {
    const user = userEvent.setup();
    render(<Developers />);
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    await user.click(screen.getByRole("tab", { name: "Webhook" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("checkout.paid");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"type": "checkout.paid"'),
    );
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("starts sign-in for an API key when signed out", async () => {
    const user = userEvent.setup();
    render(<Developers />);
    await user.click(screen.getByRole("button", { name: "Get an API key" }));
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });
});

describe("UnderTheHood", () => {
  it("highlights one layer at a time", async () => {
    const user = userEvent.setup();
    render(<UnderTheHood />);
    await user.click(screen.getByRole("button", { name: "Zcash standards" }));
    const zip321 = screen.getByText("ZIP-321").closest("li");
    const halo = screen.getByText("Orchard · Halo 2").closest("li");
    expect(zip321).toHaveAttribute("data-dim", "false");
    expect(halo).toHaveAttribute("data-dim", "true");
  });
});

describe("LiveLedger", () => {
  it("shows what the chain sees instead of the balance", async () => {
    const user = userEvent.setup();
    render(<LiveLedger />);
    expect(screen.getByText("Shielded balance")).toBeInTheDocument();
    await act(async () => {});

    await user.click(screen.getByRole("button", { name: "Chain" }));

    expect(screen.getByText("Not on the chain")).toBeInTheDocument();
    expect(screen.getAllByText("Shielded transaction").length).toBeGreaterThan(
      0,
    );
  });
});
