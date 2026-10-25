import {
  ArrowUpRight,
  Code2,
  FileText,
  Gift,
  History,
  Inbox,
  LayoutGrid,
  Link2,
  Settings,
  Store,
  Users,
} from "lucide-react";
import {
  CLAIMS_PATH,
  DASHBOARD_PATH,
  DEVELOPERS_PATH,
  HISTORY_PATH,
  INVOICES_PATH,
  LINKS_PATH,
  PAYROLL_PATH,
  POS_PATH,
  REQUESTS_PATH,
  SEND_PATH,
  SETTINGS_PATH,
} from "../../lib/auth-routes";

export type NavItem = {
  href: string;
  label: string;
  /** Mobile tab label, when the full one doesn't fit. */
  short?: string;
  /** For the "Other tools" list in Settings. */
  description: string;
  icon: typeof LayoutGrid;
};

// Every dashboard page. The account type (features/account) picks which of
// these the navigation shows and in what order.
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: DASHBOARD_PATH,
    label: "Overview",
    description: "Balance, payment link and recent activity.",
    icon: LayoutGrid,
  },
  {
    href: POS_PATH,
    label: "Point of sale",
    short: "Sell",
    description: "Charge customers at the counter with a QR code.",
    icon: Store,
  },
  {
    href: LINKS_PATH,
    label: "Links",
    description: "Reusable payment links with a fixed or open amount.",
    icon: Link2,
  },
  {
    href: INVOICES_PATH,
    label: "Invoices",
    description: "Invoices that mark themselves paid, one-off or recurring.",
    icon: FileText,
  },
  {
    href: SEND_PATH,
    label: "Send",
    description: "Pay a @username, an address or a zcash: link.",
    icon: ArrowUpRight,
  },
  {
    href: PAYROLL_PATH,
    label: "Payroll",
    description: "Pay up to 50 people in one shielded transaction.",
    icon: Users,
  },
  {
    href: CLAIMS_PATH,
    label: "Claim links",
    short: "Claims",
    description: "Send ZEC to someone who has no wallet yet.",
    icon: Gift,
  },
  {
    href: HISTORY_PATH,
    label: "History",
    description: "Every payment in and out, with receipts.",
    icon: History,
  },
  {
    href: REQUESTS_PATH,
    label: "Requests",
    description: "Ask another @username to pay you, end-to-end encrypted.",
    icon: Inbox,
  },
  {
    href: DEVELOPERS_PATH,
    label: "Developers",
    short: "Dev",
    description: "Checkout API, API keys and signed webhooks.",
    icon: Code2,
  },
  {
    href: SETTINGS_PATH,
    label: "Settings",
    description: "Account, wallet, notifications and recovery.",
    icon: Settings,
  },
];
