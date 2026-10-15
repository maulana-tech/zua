import type { Metadata } from "next";
import { EmbedTheme } from "../../../../components/embed/EmbedTheme";
import { InvoiceCheckout } from "../../../../components/invoices/InvoiceCheckout";

export const metadata: Metadata = {
  title: "Invoice | Zua",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function EmbedInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { token } = await params;
  const { theme } = await searchParams;
  return (
    <>
      <EmbedTheme theme={theme} />
      <InvoiceCheckout key={token} token={token} embed />
    </>
  );
}
