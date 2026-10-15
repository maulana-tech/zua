import type { Metadata } from "next";
import { EmbedTheme } from "../../../../components/embed/EmbedTheme";
import { PayView } from "../../../pay/[username]/PayView";

export const metadata: Metadata = {
  title: "Pay with Zcash | Zua",
  robots: { index: false, follow: false },
};

type Search = { amount?: string; theme?: string };

export default async function EmbedPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<Search>;
}) {
  const { username } = await params;
  const { amount, theme } = await searchParams;
  return (
    <>
      <EmbedTheme theme={theme} />
      <PayView
        username={decodeURIComponent(username).toLowerCase()}
        embed
        initialAmount={
          amount && /^\d{1,8}(\.\d{1,8})?$/.test(amount) ? amount : undefined
        }
      />
    </>
  );
}
