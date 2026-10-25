"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import {
  dashButtonSecondary,
  dashCell,
} from "../../components/dashboard/styles";
import {
  type AlertPrefs,
  chime,
  loadAlertPrefs,
  saveAlertPrefs,
  systemNotificationsSupported,
} from "./paymentAlerts";

const checkboxClass =
  "mt-0.5 size-4 rounded border-(--dash-line-strong) bg-(--dash-surface) text-(--dash-fg) focus:ring-(--dash-fg)";

/**
 * Per-device payment alerts. A toast always appears in the app; sound and a
 * system notification (for a background tab) are opt-in here.
 */
export function PaymentAlertsRow() {
  const [prefs, setPrefs] = useState<AlertPrefs>({
    sound: false,
    system: false,
  });
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  useEffect(() => {
    setPrefs(loadAlertPrefs());
    if (systemNotificationsSupported()) setPermission(Notification.permission);
  }, []);

  function update(next: AlertPrefs) {
    setPrefs(next);
    saveAlertPrefs(next);
  }

  async function toggleSystem(on: boolean) {
    if (!on) return update({ ...prefs, system: false });
    const result =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    setPermission(result);
    update({ ...prefs, system: result === "granted" });
  }

  return (
    <section className={`${dashCell} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="dashboard-tile-title">Payment alerts</h2>
        <BellRing className="size-4 text-(--dash-ash)" aria-hidden="true" />
      </div>
      <p className="mt-3 max-w-xl text-sm leading-6 text-(--dash-ash)">
        Zua tells you the moment your wallet finds a payment. Your wallet does
        the finding on this device, so alerts only work while Zua is open in a
        tab. The server never knows a payment arrived.
      </p>

      <div className="mt-5 space-y-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={prefs.sound}
            onChange={(e) => {
              update({ ...prefs, sound: e.target.checked });
              if (e.target.checked) chime();
            }}
            className={checkboxClass}
          />
          <span>
            <span className="text-sm font-medium text-(--dash-fg)">
              Play a sound
            </span>
            <span className="block text-xs text-(--dash-ash)">
              Useful at a counter, so you hear a sale land.
            </span>
          </span>
        </label>

        {permission !== null ? (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={prefs.system}
              disabled={permission === "denied"}
              onChange={(e) => void toggleSystem(e.target.checked)}
              className={checkboxClass}
            />
            <span>
              <span className="text-sm font-medium text-(--dash-fg)">
                Notify me in the background
              </span>
              <span className="block text-xs text-(--dash-ash)">
                {permission === "denied"
                  ? "Notifications are blocked for this site in your browser settings."
                  : "A system notification with the amount while Zua sits in another tab."}
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <button
        type="button"
        className={`${dashButtonSecondary} mt-5`}
        onClick={() => chime()}
      >
        Test sound
      </button>
    </section>
  );
}
