import type { Metadata } from "next";
import { Suspense } from "react";
import {
  disconnectTelegramAction,
  refreshNotificationsAction,
  sendTestNotificationAction,
  setNotificationsEnabledAction,
  startTelegramLinkAction
} from "@/app/actions/notifications";
import { createLocationAction, updateBusinessAction } from "@/app/actions/organizations";
import { BusinessForm } from "@/components/business/business-form";
import { LocationForm } from "@/components/business/location-form";
import { TelegramConnect } from "@/components/settings/telegram-connect";
import { ActionButton } from "@/components/team/action-button";
import { Badge, Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { daysUntil } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { getTelegramConfig } from "@/lib/telegram";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Settings" };

async function Settings({ params }: Pick<PageProps<"/b/[slug]/settings">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const [locationsResult, planResult, notificationsResult] = await Promise.all([
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
      .maybeSingle(),
    supabase
      .from("organization_notifications")
      .select("telegram_chat_title, telegram_linked_at, is_enabled")
      .eq("organization_id", org.id)
      .maybeSingle()
  ]);
  const telegram = notificationsResult.data;
  const telegramReady = getTelegramConfig() !== null;

  const locations = locationsResult.data ?? [];
  const plan = planResult.data;
  const trialDays = org.plan_code === "trial" ? daysUntil(org.trial_ends_at, await requestNow()) : null;
  const limit = (value: number | null | undefined) => (value == null ? "Unlimited" : String(value));

  return (
    <div className="space-y-6">
      <PageTitle>Settings</PageTitle>

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
        <ul className="mb-4 divide-y divide-line">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-medium text-ink">{location.name}</span>
              {location.is_default ? <Badge>Main</Badge> : null}
            </li>
          ))}
        </ul>
        <LocationForm action={createLocationAction.bind(null, org.slug)} />
      </Card>

      <Card>
        <CardHeader
          title="Telegram notifications"
          description="Get a message in a Telegram group whenever an order, dispatch, return or stock change is recorded."
        />
        {!telegramReady ? (
          <p className="font-medium text-ink-soft">Telegram notifications are not available yet.</p>
        ) : telegram?.telegram_linked_at ? (
          <div className="space-y-4">
            <p className="font-semibold">
              Connected to {telegram.telegram_chat_title ?? "a Telegram chat"}.{" "}
              {telegram.is_enabled ? (
                <Badge tone="solid">On</Badge>
              ) : (
                <Badge tone="accent">Paused</Badge>
              )}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              {telegram.is_enabled ? (
                <ActionButton
                  action={sendTestNotificationAction.bind(null, org.slug)}
                  label="Send a test message"
                  pendingLabel="Sending…"
                  showSuccess
                />
              ) : null}
              <ActionButton
                action={setNotificationsEnabledAction.bind(null, org.slug, !telegram.is_enabled)}
                label={telegram.is_enabled ? "Pause" : "Resume"}
              />
              <ActionButton
                action={disconnectTelegramAction.bind(null, org.slug)}
                label="Disconnect"
                variant="danger"
                confirmMessage="Disconnect Telegram? Messages will stop until you connect a chat again."
              />
            </div>
          </div>
        ) : (
          <TelegramConnect
            startAction={startTelegramLinkAction.bind(null, org.slug)}
            refreshAction={refreshNotificationsAction.bind(null, org.slug)}
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Plan" />
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-soft">Current plan</dt>
            <dd className="font-medium text-ink">
              {plan?.name ?? org.plan_code}
              {trialDays !== null ? ` · ${trialDays} day${trialDays === 1 ? "" : "s"} left` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Team members</dt>
            <dd className="font-medium text-ink">{limit(plan?.max_members)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Locations</dt>
            <dd className="font-medium text-ink">{limit(plan?.max_locations)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-soft">
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
