import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { describeAction, describeDetails, isCorrection } from "@/lib/audit";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Activity" };

const PAGE_SIZE = 50;

function formatWhen(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

async function Activity({ params, searchParams }: PageProps<"/b/[slug]/activity">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  const before = typeof query.before === "string" && !Number.isNaN(Date.parse(query.before)) ? query.before : null;

  let request = supabase
    .from("audit_logs")
    .select("id, action, new_values, created_at, profiles (full_name, email)")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) request = request.lt("created_at", before);

  const { data } = await request;
  const entries = (data ?? []).slice(0, PAGE_SIZE);
  const hasMore = (data ?? []).length > PAGE_SIZE;
  const base = `/b/${org.slug}/activity`;

  return (
    <div className="space-y-6">
      <PageTitle sub="Everything anyone has done in this business, newest first. Only owners and admins see this.">
        Activity
      </PageTitle>

      {entries.length === 0 ? (
        <EmptyState title="Nothing here">There is no earlier activity.</EmptyState>
      ) : (
        <ListCard title={before ? "Earlier activity" : "Latest activity"}>
          <ul className="divide-y divide-line">
            {entries.map((entry) => {
              const details = describeDetails(entry.new_values);
              return (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-extrabold">
                      {describeAction(entry.action)}
                      {isCorrection(entry.action) ? (
                        <span className="ml-2 align-middle">
                          <Badge tone="accent">Undo</Badge>
                        </span>
                      ) : null}
                    </p>
                    {details ? <p className="break-words text-sm font-medium text-ink-soft">{details}</p> : null}
                  </div>
                  <p className="shrink-0 text-right text-sm font-medium text-ink-soft">
                    <span className="block font-bold text-ink">
                      {entry.profiles?.full_name || entry.profiles?.email || "Someone no longer on the team"}
                    </span>
                    {formatWhen(entry.created_at, org.timezone)}
                  </p>
                </li>
              );
            })}
          </ul>
        </ListCard>
      )}

      <div className="flex flex-wrap gap-3">
        {before ? (
          <Link href={base} className={buttonClass("secondary")}>
            Back to latest
          </Link>
        ) : null}
        {hasMore ? (
          <Link
            href={`${base}?before=${encodeURIComponent(entries[entries.length - 1].created_at)}`}
            className={buttonClass("secondary")}
          >
            Show earlier
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function ActivityPage(props: PageProps<"/b/[slug]/activity">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Activity {...props} />
    </Suspense>
  );
}
