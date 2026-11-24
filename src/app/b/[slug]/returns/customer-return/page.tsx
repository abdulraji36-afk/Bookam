import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { recordEmptiesFollowupAction } from "@/app/actions/returns";
import { CustomerFollowupForm } from "@/components/returns/followup-form";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { getShortageLines } from "@/lib/shortages";

/** The tab title in the business's own words ("Return shortages" for goods). */
export async function generateMetadata({ params }: PageProps<"/b/[slug]/returns/customer-return">): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await requireOrg(slug);
  return { title: t("Customer brought back empties") };
}

async function CustomerReturn({ params }: Pick<PageProps<"/b/[slug]/returns/customer-return">, "params">) {
  const { slug } = await params;
  const { supabase, org, t } = await requireOrg(slug, MANAGER_ROLES);
  const base = `/b/${org.slug}`;
  if (!org.sells_drinks) redirect(`${base}/returns`);

  // Oldest shortage first, so the one that has waited longest is on top.
  const { rows } = await getShortageLines(supabase, org.id, { openOnly: true });
  const shortages = rows
    .map((line) => ({
      id: line.id,
      customerId: line.customer_id,
      customerName: line.customer_name,
      orderNo: line.order_no,
      tripNo: line.trip_no,
      returnedDate: line.returned_date,
      outstanding: Number(line.outstanding)
    }))
    .reverse();

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub={t("For empties a customer still owes from an order that came back short. They pay off that order only, and go into the store count.")}>
        {t("Customer brought back empties")}
      </PageTitle>
      {shortages.length === 0 ? (
        <EmptyState title={t("Nobody owes empties")}>
          {t("No order is waiting for empties right now.")}{" "}
          <Link href={`${base}/returns/shortages`} className="font-bold underline underline-offset-4">
            See every shortage
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <CustomerFollowupForm
            action={recordEmptiesFollowupAction.bind(null, org.slug)}
            shortages={shortages}
            today={todayIn(org.timezone, await requestNow())}
            returnTo="shortages"
          />
        </Card>
      )}
      <Link href={`${base}/returns/shortages`} className={buttonClass("secondary")}>
        {t("Back to empty shortages")}
      </Link>
    </div>
  );
}

export default function CustomerReturnPage({ params }: PageProps<"/b/[slug]/returns/customer-return">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomerReturn params={params} />
    </Suspense>
  );
}
