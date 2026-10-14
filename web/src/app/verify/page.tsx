import type { Metadata } from "next";
import { VerifyReceipt } from "../../components/receipts/VerifyReceipt";

export const metadata: Metadata = {
  title: "Verify a receipt | Zua",
  description: "Check a Zua payment receipt against the Zcash blockchain.",
};

export default function VerifyPage() {
  return (
    <main id="main-content" className="w-full min-w-0">
      <VerifyReceipt />
    </main>
  );
}
