"use client";

import { Check, Copy, KeyRound, Trash2, Webhook } from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "../../trpc/react";
import { Input } from "../ui/input";
import { useWallet } from "../WalletProvider";
import { DashboardPageHeader } from "./DashboardPageHeader";
import {
  dashButtonPrimary,
  dashButtonSecondary,
  dashCell,
  dashIconButton,
  dashLedger,
} from "./styles";

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={dashButtonSecondary}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const pre =
  "overflow-auto rounded-(--dash-radius-sm) border border-(--dash-line) bg-(--dash-tint) p-3 font-mono text-xs whitespace-pre";

/** API keys, webhooks and the address pool for the merchant Checkout API. */
export function DevelopersDashboard() {
  const { syncNow, zcash } = useWallet();
  const utils = trpc.useUtils();
  const overview = trpc.developer.overview.useQuery();
  const refresh = () => void utils.developer.overview.invalidate();
  const createKey = trpc.developer.createKey.useMutation({
    onSuccess: refresh,
  });
  const revokeKey = trpc.developer.revokeKey.useMutation({
    onSuccess: refresh,
  });
  const setWebhook = trpc.developer.setWebhook.useMutation({
    onSuccess: refresh,
  });
  const rotate = trpc.developer.rotateWebhookSecret.useMutation({
    onSuccess: refresh,
  });
  const removeHook = trpc.developer.deleteWebhook.useMutation({
    onSuccess: refresh,
  });
  const testHook = trpc.developer.testWebhook.useMutation({
    onSuccess: refresh,
  });

  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (overview.data?.webhook) setUrl(overview.data.webhook.url);
  }, [overview.data?.webhook]);

  const data = overview.data;
  const apiBase = data?.apiBase.startsWith("http")
    ? data.apiBase
    : `${origin}/api/v1`;
  const error =
    createKey.error ?? revokeKey.error ?? setWebhook.error ?? testHook.error;

  return (
    <>
      <DashboardPageHeader
        title="Developers"
        description="Take shielded ZEC in your own checkout: create checkouts from your server, and get a signed webhook when they're paid. Payments stay shielded: Zua learns a checkout is paid only when your wallet reports it, the next time this dashboard syncs."
      />
      <div className="grid gap-4">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        ) : null}

        <div className={dashLedger}>
          <section className={`${dashCell} p-5`} aria-labelledby="keys-title">
            <h2 id="keys-title" className="dashboard-tile-title">
              <KeyRound className="mr-1 inline size-4" aria-hidden="true" /> API
              keys
            </h2>
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const created = await createKey.mutateAsync({
                  name: keyName || "Server key",
                });
                setNewKey(created.key);
                setKeyName("");
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium">
                Name
                <Input
                  appearance="linen"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Shop server"
                  maxLength={60}
                />
              </label>
              <button
                type="submit"
                className={dashButtonPrimary}
                disabled={createKey.isPending}
              >
                Create key
              </button>
            </form>
            {newKey ? (
              <div className="mt-3 grid gap-2 rounded-(--dash-radius-sm) border border-(--dash-line-strong) p-3">
                <p className="text-sm font-semibold">
                  Copy it now: it won&apos;t be shown again.
                </p>
                <p className="break-all font-mono text-xs">{newKey}</p>
                <div>
                  <CopyButton text={newKey} label="Copy key" />
                </div>
              </div>
            ) : null}
            <ul className="mt-3 grid gap-2 text-sm">
              {data?.keys.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-(--dash-radius-sm) border border-(--dash-line) p-3"
                >
                  <span>
                    {k.name}{" "}
                    <span className="font-mono text-xs text-(--dash-ash)">
                      {k.preview}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-(--dash-ash)">
                    {k.lastUsedAt
                      ? `Used ${new Date(k.lastUsedAt).toLocaleString()}`
                      : "Never used"}
                    <button
                      type="button"
                      className={dashIconButton}
                      aria-label={`Revoke ${k.name}`}
                      onClick={() => revokeKey.mutate({ id: k.id })}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
              {data && !data.keys.length ? (
                <li className="text-(--dash-ash)">No keys yet.</li>
              ) : null}
            </ul>
          </section>
        </div>

        <div className={dashLedger}>
          <section className={`${dashCell} p-5`} aria-labelledby="hook-title">
            <h2 id="hook-title" className="dashboard-tile-title">
              <Webhook className="mr-1 inline size-4" aria-hidden="true" />{" "}
              Webhook
            </h2>
            <p className="mt-2 text-sm text-(--dash-ash)">
              Zua POSTs <code>checkout.paid</code> (and{" "}
              <code>invoice.paid</code>) here, signed with the secret below.
            </p>
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setWebhook.mutate({ url });
              }}
            >
              <label className="grid min-w-64 flex-1 gap-1.5 text-sm font-medium">
                Endpoint URL
                <Input
                  appearance="linen"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://shop.example/zua-webhook"
                  required
                />
              </label>
              <button
                type="submit"
                className={dashButtonPrimary}
                disabled={setWebhook.isPending}
              >
                Save
              </button>
            </form>
            {data?.webhook ? (
              <div className="mt-3 grid gap-2 text-sm">
                <p>
                  Signing secret:{" "}
                  <span className="font-mono text-xs break-all">
                    {showSecret ? data.webhook.secret : "whsec_••••••••"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={dashButtonSecondary}
                    onClick={() => setShowSecret((v) => !v)}
                  >
                    {showSecret ? "Hide" : "Reveal"}
                  </button>
                  <CopyButton text={data.webhook.secret} label="Copy secret" />
                  <button
                    type="button"
                    className={dashButtonSecondary}
                    onClick={() => rotate.mutate()}
                  >
                    Rotate secret
                  </button>
                  <button
                    type="button"
                    className={dashButtonSecondary}
                    disabled={testHook.isPending}
                    onClick={() => testHook.mutate()}
                  >
                    {testHook.isPending ? "Sending…" : "Send test event"}
                  </button>
                  <button
                    type="button"
                    className={dashButtonSecondary}
                    onClick={() => {
                      removeHook.mutate();
                      setUrl("");
                    }}
                  >
                    Remove
                  </button>
                </div>
                {data.deliveries.length ? (
                  <ul className="mt-2 grid gap-1 text-xs">
                    {data.deliveries.map((d) => (
                      <li key={d.id} className="flex flex-wrap gap-2">
                        <span
                          className={
                            d.status === "delivered" ? "" : "text-destructive"
                          }
                        >
                          {d.status}
                        </span>
                        <span className="font-mono">{d.event}</span>
                        <span className="text-(--dash-ash)">
                          {d.responseStatus ?? d.error} · {d.attempts} tries ·{" "}
                          {new Date(d.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <div className={dashLedger}>
          <section className={`${dashCell} p-5`} aria-labelledby="pool-title">
            <h2 id="pool-title" className="dashboard-tile-title">
              Address pool
            </h2>
            <p className="mt-2 text-sm text-(--dash-ash)">
              Each API checkout gets its own unlinkable address. Your wallet
              signs spares ahead whenever this dashboard syncs, since only it
              can make them. {data?.pool.unused ?? 0} of{" "}
              {data?.pool.target ?? 10} ready; when it runs out, checkouts use
              your profile address.
            </p>
            <button
              type="button"
              className={`${dashButtonSecondary} mt-3`}
              disabled={zcash.status !== "ready"}
              onClick={() => void syncNow().then(refresh)}
            >
              Refill now
            </button>
          </section>
        </div>

        <div className={dashLedger}>
          <section
            className={`${dashCell} grid gap-3 p-5`}
            aria-labelledby="qs-title"
          >
            <h2 id="qs-title" className="dashboard-tile-title">
              Quickstart
            </h2>
            <p className="text-sm text-(--dash-ash)">
              1. Create a checkout from your server, then send the buyer to{" "}
              <code>url</code> or embed <code>embed_url</code>.
            </p>
            <pre className={pre}>{`curl ${apiBase}/checkouts \\
  -H "Authorization: Bearer zua_sk_…" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"25.00","currency":"USD","reference":"order_1042","description":"Coffee x2"}'`}</pre>
            <p className="text-sm text-(--dash-ash)">
              2. Verify webhooks before trusting them (Node):
            </p>
            <pre
              className={pre}
            >{`import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, rawBody, header) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return v1?.length === expected.length &&
    timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
// header: req.headers["zua-signature"]`}</pre>
            <p className="text-sm text-(--dash-ash)">
              3. Or poll <code>GET {apiBase}/checkouts/:id</code>. Status is{" "}
              <code>open</code>, <code>partially_paid</code>, <code>paid</code>{" "}
              or <code>void</code>.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
