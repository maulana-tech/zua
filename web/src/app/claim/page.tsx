import type { Metadata } from "next";
import { ClaimView } from "../../components/claims/ClaimView";

export const metadata: Metadata = {
  title: "Claim a payment | Zua",
  description: "Claim shielded ZEC someone sent you as a link.",
  // The key lives in the URL fragment; keep the page itself out of indexes
  // and don't leak the URL to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ClaimPage() {
  return (
    <main id="main-content" className="w-full min-w-0">
      <ClaimView />
    </main>
  );
}
