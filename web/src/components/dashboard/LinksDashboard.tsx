"use client";

import {
  Archive,
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
} from "lucide-react";
import { useRef, useState } from "react";
import { payUrl } from "../../lib/paymentLinks";
import { trpc } from "../../trpc/react";
import { Mascot } from "../Mascot";
import { DashboardPageHeader } from "./DashboardPageHeader";
import { LinkEditorDialog, type PaymentLink } from "./LinkEditorDialog";
import { PaymentQrDialog } from "./PaymentQrDialog";
import {
  dashButtonPrimary,
  dashCell,
  dashIconButton,
  dashLedger,
} from "./styles";

export function LinksDashboard({
  username,
  origin,
}: {
  username: string;
  origin: string;
}) {
  const links = trpc.paymentLinks.mine.useQuery();
  const archive = trpc.paymentLinks.setArchived.useMutation();
  const [editing, setEditing] = useState<PaymentLink | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const all = [
    {
      id: "personal",
      slug: "",
      title: "Personal link",
      description: "Payer chooses the amount.",
      amountZec: null,
      state: "active" as const,
    },
    ...(links.data ?? []),
  ];

  return (
    <>
      <DashboardPageHeader
        title="Payment links"
        description="Share links that let anyone pay you in shielded ZEC from any Zcash wallet."
        action={
          <button
            type="button"
            className={dashButtonPrimary}
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            New link
          </button>
        }
      />
      <div className={dashLedger}>
        {links.isLoading ? (
          <div className={`${dashCell} h-40 motion-safe:animate-pulse`} />
        ) : (
          all.map((link) => (
            <LinkRow
              key={link.id}
              url={payUrl(origin, username, link.slug || undefined)}
              title={link.title}
              description={link.description}
              amount={link.amountZec}
              archived={link.state === "archived"}
              onEdit={
                "owner" in link
                  ? () => {
                      setEditing(link as PaymentLink);
                      setEditorOpen(true);
                    }
                  : undefined
              }
              onArchive={
                "owner" in link
                  ? async () => {
                      await archive.mutateAsync({
                        id: link.id,
                        archived: link.state !== "archived",
                      });
                      await links.refetch();
                    }
                  : undefined
              }
            />
          ))
        )}
        {links.data?.length === 0 ? (
          <div className={`${dashCell} flex items-center gap-4 p-6`}>
            <Mascot size={48} />
            <p className="text-sm text-(--dash-ash)">
              Create links for products, retainers or tips. Each one carries a
              private tag so you know what was paid.
            </p>
          </div>
        ) : null}
      </div>
      <LinkEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        link={editing}
        onSaved={() => void links.refetch()}
      />
    </>
  );
}

function LinkRow({
  url,
  title,
  description,
  amount,
  archived,
  onEdit,
  onArchive,
}: {
  url: string;
  title: string;
  description: string | null;
  amount: string | null;
  archived: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const qrRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={`${dashCell} flex flex-col gap-3 p-5 sm:flex-row sm:items-center ${archived ? "opacity-55" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {title}
          {archived ? (
            <span className="ml-2 text-xs text-(--dash-ash)">Archived</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-(--dash-ash)">
          {amount ? `${amount} ZEC` : "Payer chooses"}
          {description ? ` · ${description}` : ""}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-(--dash-ash)">
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={dashIconButton}
          aria-label={copied ? "Copied" : "Copy link"}
          onClick={async () => {
            await navigator.clipboard?.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </button>
        <button
          ref={qrRef}
          type="button"
          className={dashIconButton}
          aria-label="Show QR code"
          onClick={() => setQrOpen(true)}
        >
          <QrCode aria-hidden="true" />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={dashIconButton}
          aria-label="Open link"
        >
          <ExternalLink aria-hidden="true" />
        </a>
        {onEdit ? (
          <button
            type="button"
            className={dashIconButton}
            aria-label="Edit link"
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
          </button>
        ) : null}
        {onArchive ? (
          <button
            type="button"
            className={dashIconButton}
            aria-label={archived ? "Restore link" : "Archive link"}
            onClick={onArchive}
          >
            {archived ? (
              <RotateCcw aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      <PaymentQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        url={url}
        triggerRef={qrRef}
      />
    </div>
  );
}
