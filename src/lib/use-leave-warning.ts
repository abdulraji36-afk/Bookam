"use client";

import { useEffect } from "react";

/**
 * Warns before leaving a page with unsaved work, as Bilikis does on its trip
 * return screen: on the browser's back button, on a link in the app, and on
 * closing or reloading the tab.
 */
export function useLeaveWarning(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    // Closing or reloading the tab: the browser shows its own question.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    // The back button: an extra history entry catches it first.
    const marker = { leaveWarning: true };
    window.history.pushState({ ...(window.history.state ?? {}), ...marker }, "", window.location.href);
    const onPopState = () => {
      if (window.confirm(message)) {
        window.removeEventListener("popstate", onPopState);
        window.history.back();
      } else {
        window.history.pushState({ ...(window.history.state ?? {}), ...marker }, "", window.location.href);
      }
    };

    // Links inside the app.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link || link.getAttribute("target") === "_blank") return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, message]);
}
