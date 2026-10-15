"use client";

import { useEffect } from "react";

// Messages from an embedded Zua page (/embed/...) to the site that framed it
// via public/embed.js. They carry status only, never addresses, amounts the
// payer typed, or anything about the payment itself.
export type EmbedEvent =
  | { type: "zua:ready" }
  | { type: "zua:resize"; height: number }
  | { type: "zua:payer-says-paid" } // the payer pressed "I've paid"
  | { type: "zua:paid"; invoice: string }; // the payee's wallet confirmed it

export function postToParent(event: EmbedEvent) {
  if (typeof window === "undefined" || window.parent === window) return;
  // The data is non-sensitive and the embedding origin isn't known here; the
  // parent (embed.js) checks that messages come from Zua's origin.
  window.parent.postMessage(event, "*");
}

/** Announces the page and keeps the parent's iframe sized to the content. */
export function useEmbedBridge(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    postToParent({ type: "zua:ready" });
    // Measure the widget's own root: the document is at least as tall as the
    // iframe, so it could never shrink.
    const root =
      document.getElementById("zua-embed-root") ?? document.documentElement;
    const send = () =>
      postToParent({
        type: "zua:resize",
        height: Math.ceil(root.getBoundingClientRect().height),
      });
    send();
    const observer = new ResizeObserver(send);
    observer.observe(root);
    return () => observer.disconnect();
  }, [enabled]);
}
