"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { verifyClaim } from "../../lib/profileClaim";
import { seal } from "../../lib/sealedBox";
import { formatMemoTag, newMemoId } from "../../lib/zcash/memo";
import { zatToZec, zecToZat } from "../../lib/zcash/units";
import type { RequestPayload } from "../../server/modules/requests/requests.schema";
import type { RouterOutputs } from "../../server/root";
import { api } from "../../trpc/client";
import { trpc } from "../../trpc/react";
import { Mascot } from "../Mascot";
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
import { DashboardNotice } from "./DashboardNotice";
import { DashboardPageHeader } from "./DashboardPageHeader";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashFocus,
  dashLedger,
} from "./styles";

type Request = RouterOutputs["requests"]["list"][number];
const TABS = ["incoming", "outgoing"] as const;

export function RequestsDashboard() {
  const { accountUnlocked, promptUnlock, openBox } = useWallet();
  const [tab, setTab] = useState<(typeof TABS)[number]>("incoming");
  const [createOpen, setCreateOpen] = useState(false);
  const list = trpc.requests.list.useQuery(
    { direction: tab },
    { enabled: accountUnlocked, refetchInterval: 30_000 },
  );

  if (!accountUnlocked)
    return (
      <>
        <DashboardPageHeader
          title="Requests"
          description="Ask a @username to pay you, or pay what others asked for."
        />
        <DashboardNotice
          label="Locked"
          title="Unlock to read requests"
          action={
            <button
              type="button"
              className={dashButtonPrimary}
              onClick={promptUnlock}
            >
              Unlock
            </button>
          }
        >
          Request amounts and notes are encrypted to your keys. Only this device
          can read them.
        </DashboardNotice>
      </>
    );

  return (
    <>
      <DashboardPageHeader
        title="Requests"
        description="Ask a @username to pay you. The amount and note are encrypted end to end."
        action={
          <button
            type="button"
            className={dashButtonPrimary}
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden="true" />
            New request
          </button>
        }
      />
      <div
        role="tablist"
        className="mb-4 inline-flex rounded-full border border-(--dash-line) p-0.5"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-8 rounded-full px-4 text-[11px] font-semibold tracking-[0.08em] uppercase ${dashFocus} ${
              tab === t
                ? "bg-(--dash-fg) text-(--dash-surface)"
                : "text-(--dash-ash) hover:text-(--dash-fg)"
            }`}
          >
            {t === "incoming" ? "To pay" : "Sent"}
          </button>
        ))}
      </div>
      <div className={dashLedger}>
        {list.isLoading ? (
          <div className={`${dashCell} h-32 motion-safe:animate-pulse`} />
        ) : list.data?.length ? (
          list.data.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              direction={tab}
              payload={openBox<RequestPayload>(r.sealed)}
              onChanged={() => void list.refetch()}
            />
          ))
        ) : (
          <div className={`${dashCell} flex items-center gap-4 p-6`}>
            <Mascot size={48} />
            <p className="text-sm text-(--dash-ash)">
              {tab === "incoming"
                ? "Nobody has asked you to pay yet."
                : "You haven't requested a payment yet."}
            </p>
          </div>
        )}
      </div>
      <CreateRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void list.refetch()}
      />
    </>
  );
}

const STATUS = {
  pending: "Pending",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
} as const;

function RequestRow({
  request,
  direction,
  payload,
  onChanged,
}: {
  request: Request;
  direction: "incoming" | "outgoing";
  payload: RequestPayload | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const decline = trpc.requests.decline.useMutation();
  const cancel = trpc.requests.cancel.useMutation();
  const other = direction === "incoming" ? request.from : request.to;
  const amount = payload ? zatToZec(BigInt(payload.amountZat)) : null;

  return (
    <div
      className={`${dashCell} flex flex-col gap-3 p-5 sm:flex-row sm:items-center`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {direction === "incoming"
            ? `@${other} asks for`
            : `You asked @${other} for`}{" "}
          <span className="tabular-nums">
            {amount ? `${amount} ZEC` : "an encrypted amount"}
          </span>
        </p>
        <p className="mt-0.5 text-sm text-(--dash-ash)">
          {payload?.note ? `"${payload.note}" · ` : ""}
          {STATUS[request.status]} ·{" "}
          {new Date(request.createdAt).toLocaleDateString()}
        </p>
      </div>
      {request.status === "pending" ? (
        <div className="flex gap-2">
          {direction === "incoming" ? (
            <>
              <button
                type="button"
                className={dashButtonPrimary}
                disabled={!payload}
                onClick={() => {
                  const params = new URLSearchParams({
                    to: `@${request.from}`,
                    amount: amount ?? "",
                    memo: formatMemoTag({ kind: "req", id: request.id }),
                    request: request.id,
                  });
                  router.push(`/send?${params}`);
                }}
              >
                Pay
              </button>
              <button
                type="button"
                className={dashButtonSecondary}
                onClick={async () => {
                  await decline.mutateAsync({ id: request.id });
                  onChanged();
                }}
              >
                Decline
              </button>
            </>
          ) : (
            <button
              type="button"
              className={dashButtonSecondary}
              onClick={async () => {
                await cancel.mutateAsync({ id: request.id });
                onChanged();
              }}
            >
              Cancel
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CreateRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { messagingPubkey } = useWallet();
  const create = trpc.requests.create.useMutation();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const amountZat = useMemo(() => {
    try {
      return zecToZat(amount);
    } catch {
      return null;
    }
  }, [amount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const username = to.replace(/^@/, "").trim().toLowerCase();
      if (!amountZat || amountZat <= 0n)
        throw new Error("Enter an amount in ZEC.");
      const profile = await api.profiles.byUsername.query({ username });
      const claim = profile
        ? verifyClaim(profile.claimJson, profile.claimSigHex)
        : null;
      if (!profile || !claim || claim.username !== username)
        throw new Error(`@${username} doesn't exist or couldn't be verified.`);
      const mine = messagingPubkey();
      if (!mine) throw new Error("Unlock your account first.");
      const payload: RequestPayload = {
        amountZat: amountZat.toString(),
        note: note.trim(),
      };
      await create.mutateAsync({
        id: newMemoId(),
        to: username,
        forPayer: seal(payload, claim.msgPubkeyHex),
        forRequester: seal(payload, mine),
      });
      setTo("");
      setAmount("");
      setNote("");
      onCreated();
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send the request.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent appearance="linen" size="sm">
        <DialogHeader>
          <DialogTitle>Request a payment</DialogTitle>
          <DialogDescription>
            Only you and the payer can read the amount and note. The payment
            lands in your shielded balance.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm font-medium">
            From
            <Input
              appearance="linen"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="@username"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Amount (ZEC)
            <Input
              appearance="linen"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.25"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Note (optional)
            <Input
              appearance="linen"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dinner split"
            />
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={create.isPending}
            aria-busy={create.isPending}
          >
            {create.isPending ? "Sending…" : "Send request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
