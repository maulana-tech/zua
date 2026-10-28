"use client";

import { useMemo, useState } from "react";
import { APP_NAME } from "../../lib/brand";
import { zecToZat } from "../../lib/zcash/units";
import { buildPaymentUri } from "../../lib/zcash/zip321";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { QrPanel } from "../zcash/QrPanel";
import { TestnetFaucetNote } from "../zcash/TestnetFaucetNote";

/** Request a specific amount: optional amount and note baked into a ZIP-321 QR/link. */
export function ReceiveDialog({
  open,
  onClose,
  username,
  address,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  address: string;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const amountZat = useMemo(() => {
    try {
      return amount.trim() ? zecToZat(amount) : undefined;
    } catch {
      return null;
    }
  }, [amount]);
  const uri =
    amountZat === null
      ? null
      : buildPaymentUri({
          address,
          amountZat,
          memo: note.trim() || undefined,
          label: `@${username} on ${APP_NAME}`,
        });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent appearance="linen" size="sm">
        <DialogHeader>
          <DialogTitle>Receive ZEC</DialogTitle>
          <DialogDescription>
            Share this code or link with whoever is paying you. Any Zcash wallet
            (like Zodl) can open it. Payments land in your shielded balance.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Amount (optional)
            <Input
              appearance="linen"
              inputMode="decimal"
              placeholder="0.25"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              aria-invalid={amountZat === null}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Note (optional)
            <Input
              appearance="linen"
              maxLength={120}
              placeholder="Coffee"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        {uri ? (
          <QrPanel uri={uri} copyText={address} />
        ) : (
          <p className="text-sm text-destructive">
            Enter a ZEC amount with up to 8 decimals.
          </p>
        )}
        <TestnetFaucetNote className="text-xs leading-5 text-foreground/60" />
      </DialogContent>
    </Dialog>
  );
}
