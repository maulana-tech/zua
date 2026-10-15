"use client";

import { Code2 } from "lucide-react";
import { useState } from "react";
import { EmbedCodeDialog } from "../embed/EmbedCodeDialog";
import { Input } from "../ui/input";
import { dashButtonSecondary, dashCell } from "./styles";

/** "Pay with Zcash" button for @username on any website. */
export function WebsiteWidgetTile({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  return (
    <section className={`${dashCell} p-6`}>
      <h2 className="dashboard-tile-title">Website widget</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-(--dash-ash)">
        Accept shielded ZEC on your own site with one line of code: a button or
        an inline checkout for @{username}. For a fixed product, use the code
        button on a payment link instead.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Suggested amount (ZEC, optional)
          <Input
            appearance="linen"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.1"
          />
        </label>
        <button
          type="button"
          className={dashButtonSecondary}
          onClick={() => setOpen(true)}
        >
          <Code2 aria-hidden="true" /> Get the code
        </button>
      </div>
      <EmbedCodeDialog
        open={open}
        onOpenChange={setOpen}
        config={{ to: username, amount: amount || undefined }}
      />
    </section>
  );
}
