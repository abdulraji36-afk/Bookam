import type { Metadata } from "next";
import { Suspense } from "react";
import { createLocationAction, updateBusinessAction } from "@/app/actions/organizations";
import { BusinessForm } from "@/components/business/business-form";
import { LocationForm } from "@/components/business/location-form";
import { Badge, Card, CardHeader, PageSkeleton } from "@/components/ui/card";
import { daysUntil } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Settings" };

async function Settings({ params }: Pick<PageProps<"/b/[slug]/settings">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const [locationsResult, planResult] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, is_default")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("plans")
      .select("name, max_members, max_locations")
      .eq("code", org.plan_code)
      .maybeSingle()
  ]);

  const locations = locationsResult.data ?? [];
  const plan = planResult.data;
  const trialDays = org.plan_code === "trial" ? daysUntil(org.trial_ends_at, await requestNow()) : null;
  const limit = (value: number | null | undefined) => (value == null ? "Unlimited" : String(value));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader title="Business details" />
        <BusinessForm
          action={updateBusinessAction.bind(null, org.slug)}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          defaults={{ name: org.name, businessType: org.business_type }}
        />
      </Card>

      <Card>
        <CardHeader
          title="Locations"
          description="Each store, depot or warehouse you keep stock in."
        />
        <ul className="mb-4 divide-y divide-slate-100">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-medium text-slate-900">{location.name}</span>
              {location.is_default ? <Badge>Main</Badge> : null}
            </li>
          ))}
        </ul>
        <LocationForm action={createLocationAction.bind(null, org.slug)} />
      </Card>

      <Card>
        <CardHeader title="Plan" />
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-600">Current plan</dt>
            <dd className="font-medium text-slate-900">
              {plan?.name ?? org.plan_code}
              {trialDays !== null ? ` · ${trialDays} day${trialDays === 1 ? "" : "s"} left` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">Team members</dt>
            <dd className="font-medium text-slate-900">{limit(plan?.max_members)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Locations</dt>
            <dd className="font-medium text-slate-900">{limit(plan?.max_locations)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          Currency {org.currency_code} · time zone {org.timezone}
        </p>
      </Card>
    </div>
  );
}

export default function SettingsPage({ params }: PageProps<"/b/[slug]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings params={params} />
    </Suspense>
  );
}
