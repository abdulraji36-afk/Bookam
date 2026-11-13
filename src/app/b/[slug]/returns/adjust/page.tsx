import type { Metadata } from "next";
import { Suspense } from "react";
import { recordAdjustmentAction, recordOpeningDebtAction } from "@/app/actions/returns";
import { AdjustmentForm } from "@/components/returns/adjustment-form";
import { OpeningDebtForm } from "@/components/returns/opening-debt-form";
import { Card, CardHeader, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { getReturnsFormData } from "@/lib/returnables";

export const metadata: Metadata = { title: "Add or subtract" };

async function Adjust({ params }: Pick<PageProps<"/b/[slug]/returns/adjust">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  const data = await getReturnsFormData(supabase, org.id);

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Change the count in store, with a reason. Only owners and admins can do this.">
        Add or subtract
      </PageTitle>
      {data.returnables.length === 0 ? (
        <EmptyState title="Nothing to adjust">None of your products have a returnable item yet.</EmptyState>
      ) : (
        <>
          <Card>
            <AdjustmentForm
              action={recordAdjustmentAction.bind(null, org.slug)}
              today={todayIn(org.timezone, await requestNow())}
              {...data}
            />
          </Card>
          <Card>
            <CardHeader
              title="A customer already owed some"
              description="Use this once per customer when you start, for what they owed before you began using Bookam. It does not change the count in store."
            />
            <OpeningDebtForm
              action={recordOpeningDebtAction.bind(null, org.slug)}
              returnables={data.returnables}
              customers={data.customers}
            />
          </Card>
        </>
      )}
    </div>
  );
}

export default function AdjustPage({ params }: PageProps<"/b/[slug]/returns/adjust">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Adjust params={params} />
    </Suspense>
  );
}
