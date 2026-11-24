import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { recordSupplierExchangeAction } from "@/app/actions/returns";
import { ExchangeForm } from "@/components/returns/exchange-form";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { getReturnsFormData } from "@/lib/returnables";

/** The tab title in the business's own words ("New supplier return" for goods). */
export async function generateMetadata({ params }: PageProps<"/b/[slug]/returns/exchange">): Promise<Metadata> {
  const { slug } = await params;
  const { org, t } = await requireOrg(slug);
  return { title: org.sells_drinks ? t("New empty exchange") : "Supplier exchange" };
}

async function Exchange({ params }: Pick<PageProps<"/b/[slug]/returns/exchange">, "params">) {
  const { slug } = await params;
  const { supabase, org, t } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const [data, { data: holdings }] = await Promise.all([
    getReturnsFormData(supabase, org.id),
    supabase.from("returnable_holdings").select("returnable_item_id, location_id, holding").eq("organization_id", org.id)
  ]);
  const first = data.returnables[0];
  const inStore = Object.fromEntries(
    (holdings ?? [])
      .filter((row) => row.returnable_item_id === first?.id)
      .map((row) => [row.location_id, Number(row.holding)])
  );

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle
        sub={
          org.sells_drinks
            ? t("Record the empties the supplier took away, with their delivery reference. Only the empties taken come off your store count.")
            : "Record what your supplier took away. It comes off what you have in store."
        }
      >
        {org.sells_drinks ? t("New empty exchange") : t("Supplier exchange")}
      </PageTitle>
      {data.returnables.length === 0 ? (
        <EmptyState title={t("Nothing to exchange")}>None of your products have a returnable item yet.</EmptyState>
      ) : (
        <Card>
          <ExchangeForm
            action={recordSupplierExchangeAction.bind(null, org.slug)}
            returnables={data.returnables}
            locations={data.locations}
            today={todayIn(org.timezone, await requestNow())}
            drinks={org.sells_drinks}
            inStore={inStore}
          />
        </Card>
      )}
      <Link href={`${base}/returns/exchanges`} className={buttonClass("secondary")}>
        {t("See all exchanges")}
      </Link>
    </div>
  );
}

export default function ExchangePage({ params }: PageProps<"/b/[slug]/returns/exchange">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Exchange params={params} />
    </Suspense>
  );
}
