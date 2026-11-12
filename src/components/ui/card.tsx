import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-md bg-white p-5 sm:p-6 ${className}`}>{children}</section>
  );
}

/** Heavy underlined title that runs edge to edge across the top of a Card. */
export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="-mx-5 -mt-5 mb-5 sm:-mx-6 sm:-mt-6">
      <h2 className="border-b-[3px] border-ink px-5 py-3.5 text-lg font-extrabold uppercase tracking-wide sm:px-6">
        {title}
      </h2>
      {description ? <p className="px-5 pt-4 text-sm text-ink-soft sm:px-6">{description}</p> : null}
    </header>
  );
}

type BadgeTone = "plain" | "solid" | "accent";

const BADGE_TONES: Record<BadgeTone, string> = {
  plain: "bg-chip text-ink",
  solid: "bg-ink text-white",
  accent: "bg-accent text-accent-ink"
};

export function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">{children}</h1>
      {sub ? <p className="mt-1 font-medium text-ink-soft">{sub}</p> : null}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-48 animate-pulse rounded bg-chip" />
      <div className="h-40 animate-pulse rounded-md bg-white" />
    </div>
  );
}
