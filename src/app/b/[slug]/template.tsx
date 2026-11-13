import type { ReactNode } from "react";

/**
 * A template is created afresh for every page inside a business, so each
 * page eases in as you arrive instead of snapping into place.
 */
export default function BusinessTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
