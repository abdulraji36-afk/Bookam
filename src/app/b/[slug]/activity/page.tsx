import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { Pager } from "@/components/ui/list-search";
import { PageHeader } from "@/components/ui/page-header";
import { AUDIT_ACTIONS, describeAction, describeDetails, describeRecord, isCorrection } from "@/lib/audit";
import { formatDay } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { dayOf, formatTime, readDateRange, recordHref } from "@/lib/records";
import { requestNow } from "@/lib/request-time";
import { readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const INPUT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium focus:border-ink focus:outline-2 focus:outline-accent";

/**
 * Bilikis's Audit Log: everything anyone did in the business, newest first,
 * narrowed by date, action or person. Owners and admins only.
 */
async function AuditLog({ params, searchParams }: PageProps<"/b/[slug]/activity">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  const path = `/b/${org.slug}/activity`;
  const range = readDateRange(query, org.timezone, await requestNow());
  const page = readListSearch(query, PAGE_SIZE);
  const action =
    typeof query.action === "string" && AUDIT_ACTIONS.some(([key]) => key === query.action) ? query.action : "";
  const actor = typeof query.actor === "string" && /^[0-9a-f-]{36}$/i.test(query.actor) ? query.actor : "";

  let request = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, old_values, new_values, created_at, user_id, profiles (full_name, email)", {
      count: "exact"
    })
    .eq("organization_id", org.id)
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .order("created_at", { ascending: false })
    .range(page.from, page.to);
  if (action) request = request.eq("action", action);
  if (actor) request = request.eq("user_id", actor);

  const [result, members] = await Promise.all([
    request,
    supabase.from("memberships").select("user_id, profiles (full_name, email)").eq("organization_id", org.id)
  ]);
  if (result.error) console.error("Audit log could not load:", result.error);
  const entries = result.data ?? [];
  const total = result.count ?? 0;
  const people = (members.data ?? [])
    .map((member) => ({
      id: member.user_id,
      name: member.profiles?.full_name || member.profiles?.email || "Team member"
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const filters = { from: range.from, to: range.to, action, actor };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        sub="Everything anyone has done in this business, newest first. Only owners and admins see this."
      />

      <Card>
        <CardHeader title="Find records" description="Narrow the audit log by date, action or team member." />
        <form method="get" action={path} className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_1.1fr_auto] xl:items-end">
          <label className="block text-sm font-bold">
            From
            <input className={INPUT} type="date" name="from" defaultValue={range.from} max={range.today} />
          </label>
          <label className="block text-sm font-bold">
            To
            <input className={INPUT} type="date" name="to" defaultValue={range.to} max={range.today} />
          </label>
          <label className="block text-sm font-bold">
            Action
            <select className={INPUT} name="action" defaultValue={action}>
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            Team member
            <select className={INPUT} name="actor" defaultValue={actor}>
              <option value="">Everyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary")}>
              Apply
            </button>
            <Link href={path} className={buttonClass("ghost")}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {result.error ? (
        <Alert tone="error">The audit log could not be loaded. Please refresh the page.</Alert>
      ) : entries.length === 0 ? (
        <EmptyState title="Nothing recorded">
          Nothing matches between {formatDay(range.from)} and {formatDay(range.to)}.
        </EmptyState>
      ) : (
        <TableCard title="Audit history">
          <DataTable
            label="Audit history"
            rows={entries}
            rowKey={(entry) => entry.id}
            columns={[
              { header: "Date", cell: (entry) => formatDay(dayOf(entry.created_at, org.timezone)) },
              { header: "Time", cell: (entry) => formatTime(entry.created_at, org.timezone) },
              {
                header: "Action",
                wrap: true,
                cell: (entry) => (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold">{describeAction(entry.action)}</span>
                    {isCorrection(entry.action) ? <Badge tone="accent">Undo</Badge> : null}
                  </span>
                )
              },
              {
                header: "Record",
                wrap: true,
                cell: (entry) => describeRecord(entry.entity_type, entry.entity_id, entry.new_values, entry.old_values)
              },
              {
                header: "Actor",
                wrap: true,
                cell: (entry) => entry.profiles?.full_name || entry.profiles?.email || "Someone no longer on the team"
              },
              {
                header: "Details",
                wrap: true,
                cell: (entry) => <span className="text-sm text-ink-soft">{describeDetails(entry.new_values) || "—"}</span>
              }
            ]}
          />
        </TableCard>
      )}
      <Pager base={path} search={page} total={total} hrefFor={(number) => recordHref(path, { ...filters, page: number })} />
    </div>
  );
}

export default function ActivityPage(props: PageProps<"/b/[slug]/activity">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditLog {...props} />
    </Suspense>
  );
}
