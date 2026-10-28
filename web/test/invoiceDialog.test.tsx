// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateInvoiceDialog } from "../src/components/invoices/CreateInvoiceDialog";
import type { InvoiceView } from "../src/features/invoices/types";

const { api, wallet } = vi.hoisted(() => ({
  api: {
    invoices: {
      create: { mutate: vi.fn(async (input: unknown) => input) },
      update: { mutate: vi.fn(async (input: unknown) => input) },
    },
  },
  wallet: {
    username: "dinar",
    freshPayAddress: vi.fn(async () => ({
      claimJson: '{"addr":"u1fresh"}',
      sigHex: "a".repeat(128),
    })),
  },
}));
vi.mock("../src/trpc/client", () => ({ api }));
vi.mock("../src/components/WalletProvider", () => ({
  useWallet: () => wallet,
}));

const invoice = {
  id: "abcdefgh1234",
  token: "t".repeat(32),
  username: "dinar",
  ua: "u1",
  payAddress: null,
  number: "INV-2026-007",
  clientName: "Acme",
  items: [{ description: "Logo design", quantity: 2, unitPrice: "1.25" }],
  currency: "ZEC",
  totalUsd: null,
  quote: null,
  totalZat: "250000000",
  totalZec: "2.5",
  paidZat: "0",
  notes: "Thanks!",
  dueDate: "2026-11-30",
  status: "pending",
  source: "dashboard",
  reference: null,
  recurrence: "monthly",
  nextIssueAt: null,
  paidReportedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
} satisfies InvoiceView;

describe("CreateInvoiceDialog", () => {
  it("duplicates with the next free number and a fresh address", async () => {
    const onSaved = vi.fn();
    render(
      <CreateInvoiceDialog
        open
        onOpenChange={() => {}}
        onSaved={onSaved}
        template={{ invoice, mode: "duplicate" }}
        takenNumbers={["INV-2026-007", "INV-2026-008"]}
      />,
    );
    expect(screen.getByLabelText("Invoice number")).toHaveValue("INV-2026-009");
    expect(screen.getByLabelText("Client name")).toHaveValue("Acme");
    expect(screen.getByLabelText("Description 1")).toHaveValue("Logo design");
    expect(screen.getByLabelText("Repeat")).toHaveTextContent(
      "Does not repeat",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create invoice" }),
    );
    expect(wallet.freshPayAddress).toHaveBeenCalled();
    expect(api.invoices.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        number: "INV-2026-009",
        items: [{ description: "Logo design", quantity: 2, unitPrice: "1.25" }],
        payAddress: expect.objectContaining({ sigHex: "a".repeat(128) }),
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("edits in place and keeps the saved client email when left empty", async () => {
    render(
      <CreateInvoiceDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        template={{ invoice, mode: "edit" }}
      />,
    );
    expect(screen.getByText("Edit INV-2026-007")).toBeTruthy();
    expect(screen.getByLabelText("Repeat")).toBeDisabled();
    const qty = screen.getByLabelText("Quantity 1");
    await userEvent.clear(qty);
    await userEvent.type(qty, "3");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(api.invoices.update.mutate).toHaveBeenCalledWith({
      id: "abcdefgh1234",
      keepClientEmail: true,
      invoice: expect.objectContaining({
        number: "INV-2026-007",
        dueDate: "2026-11-30",
        items: [{ description: "Logo design", quantity: 3, unitPrice: "1.25" }],
      }),
    });
  });
});
