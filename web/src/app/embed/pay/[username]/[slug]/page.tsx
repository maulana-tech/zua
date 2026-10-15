import type { Metadata } from "next";
import { EmbedTheme } from "../../../../../components/embed/EmbedTheme";
import { PayView } from "../../../../pay/[username]/PayView";

export const metadata: Metadata = {
  title: "Pay with Zcash | Zua",
  robots: { index: false, follow: false },
};

export default async function EmbedPayLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { username, slug } = await params;
  const { theme } = await searchParams;
  return (
    <>
      <EmbedTheme theme={theme} />
      <PayView
        username={decodeURIComponent(username).toLowerCase()}
        slug={decodeURIComponent(slug).toLowerCase()}
        embed
      />
    </>
  );
}
