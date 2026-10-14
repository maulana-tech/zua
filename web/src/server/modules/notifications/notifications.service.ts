import "server-only";
import { getServerEnv } from "../../../env.server";
import type { InvoiceView } from "../../../features/invoices/types";
import { APP_NAME } from "../../../lib/brand";
import { getProfiles } from "../../db/mongo";
import { buildEmailHtml, buildEmailText, sendEmail } from "../../lib/email";
import {
  findSettings,
  type NotificationEvents,
  recordNotificationLog,
} from "./notifications.repository";

type Email = { subject: string; title: string; message: string; path: string };

async function dispatch(params: {
  userId: string;
  eventKey: string;
  eventType: keyof NotificationEvents;
  email: Email;
}): Promise<void> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) return;
  const settings = await findSettings(params.userId);
  if (!settings?.enabled || !settings.events[params.eventType]) return;
  if (
    !(await recordNotificationLog(
      params.eventKey,
      settings.email,
      params.eventType,
    ))
  )
    return; // already sent
  const appUrl = env.APP_URL || "http://localhost:3000";
  const content = {
    title: params.email.title,
    message: params.email.message,
    actionLabel: `Open ${APP_NAME}`,
    actionUrl: `${appUrl}${params.email.path}`,
    unsubscribeUrl: `${appUrl}/unsubscribe/${settings.unsubscribeToken}`,
  };
  await sendEmail({
    to: settings.email,
    subject: params.email.subject,
    html: buildEmailHtml(content),
    text: buildEmailText(content),
  });
}

/** Invoice reached "paid" (reported by the owner's wallet). */
export function notifyInvoicePaid(userId: string, invoice: InvoiceView) {
  return dispatch({
    userId,
    eventKey: `invoice-paid:${invoice.id}`,
    eventType: "invoicePaid",
    email: {
      subject: `Invoice ${invoice.number} has been paid`,
      title: `Invoice ${invoice.number} paid`,
      message: `Your invoice ${invoice.number} for ${invoice.totalZec} ZEC was paid into your shielded balance.`,
      path: "/invoices",
    },
  });
}

/**
 * A payer pressed "I've paid" on a payment page. No amount, address or txid:
 * the server never learns those, and the email must not leak them either.
 */
export async function notifyPaymentPing(username: string, nonce: string) {
  const profile = await (await getProfiles()).findOne({ _id: username });
  if (!profile) return;
  await dispatch({
    userId: profile.userId,
    eventKey: `payment-ping:${username}:${nonce}`,
    eventType: "paymentPing",
    email: {
      subject: "Someone says they paid you",
      title: "A payment is on its way",
      message: `A payer marked a payment to @${username} as sent. Open ${APP_NAME} to sync your wallet and see it.`,
      path: "/dashboard",
    },
  });
}

export async function sendTestEmail(userId: string): Promise<boolean> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) return false;
  const settings = await findSettings(userId);
  if (!settings?.email) return false;
  const appUrl = env.APP_URL || "http://localhost:3000";
  const content = {
    title: `${APP_NAME} notification test`,
    message: "Your email notifications are set up.",
    actionLabel: "Open Settings",
    actionUrl: `${appUrl}/settings`,
    unsubscribeUrl: `${appUrl}/unsubscribe/${settings.unsubscribeToken}`,
  };
  const res = await sendEmail({
    to: settings.email,
    subject: `${APP_NAME}: test email`,
    html: buildEmailHtml(content),
    text: buildEmailText(content),
  });
  return res.ok;
}
