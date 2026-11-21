"use client";

import { useEffect } from "react";

/**
 * A page that turns out not to exist after it began streaming keeps the
 * title it started with ("Orders", "Order"). This puts the right one on the tab.
 */
export function NotFoundTitle() {
  useEffect(() => {
    document.title = "Not found · BukAm";
  }, []);
  return null;
}
