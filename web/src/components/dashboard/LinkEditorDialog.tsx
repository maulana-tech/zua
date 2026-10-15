"use client";

import { useEffect, useState } from "react";
import type { RouterOutputs } from "../../server/root";
import { trpc } from "../../trpc/react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";

export type PaymentLink = RouterOutputs["paymentLinks"]["mine"][number];

/** Create a payment link, or edit the title/amount of an existing one. */
export function LinkEditorDialog({
  open,
  onOpenChange,
  link,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: PaymentLink | null;
  onSaved: (link: PaymentLink) => void;
}) {
  const wallet = useWallet();
  const create = trpc.paymentLinks.create.useMutation();
  const update = trpc.paymentLinks.update.useMutation();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSlug(link?.slug ?? "");
    setTitle(link?.title ?? "");
    setDescription(link?.description ?? "");
    setAmount(link?.amountZec ?? "");
    setError("");
  }, [open, link]);

  const busy = create.isPending || update.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const saved = link
        ? await update.mutateAsync({ id: link.id, title, description, amount })
        : await create.mutateAsync({
            slug,
            title,
            description,
            amount,
            // Its own address, so payers of different links can't be linked.
            payAddress: await wallet.freshPayAddress(),
          });
      onSaved(saved);
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the link.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent appearance="linen" size="sm">
        <DialogHeader>
          <DialogTitle>
            {link ? "Edit payment link" : "New payment link"}
          </DialogTitle>
          <DialogDescription>
            Each link gets its own shielded address and a private tag, so payers
            of different links can't be connected and you can tell payments
            apart. Leave the amount empty to let payers choose.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          {!link ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Link name
              <Input
                appearance="linen"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
                placeholder="logo-design"
                required
              />
            </label>
          ) : null}
          <label className="grid gap-1.5 text-sm font-medium">
            Title
            <Input
              appearance="linen"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Logo design"
              maxLength={80}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Description (optional)
            <textarea
              className="min-h-24 rounded-lg border border-foreground/15 bg-background px-3 py-3 text-sm outline-none focus-visible:ring-2"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Amount in ZEC (optional)
            <Input
              appearance="linen"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="Payer chooses"
            />
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : link ? "Save changes" : "Create link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
