import type { Metadata } from "next";
import { Suspense } from "react";
import { recordSupplierExchangeAction } from "@/app/actions/returns";
import { ExchangeForm } from "@/components/returns/exchange-form";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { getReturnsFormData } from "@/lib/returnables";

export const metadata: Metadata = { title: "Supplier exchange" };

async function Exchange({ params }: Pick<PageProps<"/b/[slug]/returns/exchange">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const data = await getReturnsFormData(supabase, org.id);

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Record what your supplier took away. It comes off what you have in store.">
        Supplier exchange
      </PageTitle>
      {data.returnables.length === 0 ? (
        <EmptyState title="Nothing to exchange">None of your products have a returnable item yet.</EmptyState>
      ) : (
        <Card>
          <ExchangeForm
            action={recordSupplierExchangeAction.bind(null, org.slug)}
            returnables={data.returnables}
            locations={data.locations}
            today={todayIn(org.timezone, await requestNow())}
          />
        </Card>
      )}
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
