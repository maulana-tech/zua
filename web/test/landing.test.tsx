// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useWallet: vi.fn(), signIn: vi.fn() }));

vi.mock("../src/components/WalletProvider", () => ({
  useWallet: mocks.useWallet,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { FinalCta } from "../src/components/landing/FinalCta";
import { Hero } from "../src/components/landing/Hero";

const wallet = (authenticated = false) => ({
  authenticated,
  signIn: mocks.signIn,
});

beforeEach(() => {
  vi.clearAllMocks();
  // The hero's demo asks for a ZEC price; without one it shows ZEC only.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("landing hero", () => {
  it("leads with the promise and starts sign-in from the primary CTA", async () => {
    mocks.useWallet.mockReturnValue(wallet());
    render(<Hero />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /get paid in zec\. keep your income private\./i,
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Create your payment link" }),
    );
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "See how it works" }),
    ).toHaveAttribute("href", "#how");
  });

  it("sends signed-in visitors to their dashboard instead", () => {
    mocks.useWallet.mockReturnValue(wallet(true));
    render(<Hero />);
    expect(
      screen.getByRole("link", { name: "Open your dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.queryByRole("button", { name: "Create your payment link" }),
    ).not.toBeInTheDocument();
  });

  it("states only product facts in the stats row", () => {
    mocks.useWallet.mockReturnValue(wallet());
    render(<Hero />);
    for (const label of [
      "Proofs built on your device",
      "Phrases to write down",
      "Per invoice, link and checkout",
      "Self-custodial",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("closing call to action", () => {
  it("starts sign-in for visitors", async () => {
    mocks.useWallet.mockReturnValue(wallet());
    render(<FinalCta />);
    await userEvent.click(
      screen.getByRole("button", { name: "Create your payment link" }),
    );
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });
});
