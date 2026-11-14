import type { Metadata } from "next";
import { Suspense } from "react";
import { recordCustomerEmptiesReturnAction } from "@/app/actions/returns";
import { CustomerReturnForm } from "@/components/returns/customer-return-form";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { getReturnsFormData } from "@/lib/returnables";

export const metadata: Metadata = { title: "Customer brought back empties" };

async function CustomerReturn({ params }: Pick<PageProps<"/b/[slug]/returns/customer-return">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const data = await getReturnsFormData(supabase, org.id);
  const returnable = data.returnables[0];

  const { data: balances } = returnable
    ? await supabase
        .from("customer_returnable_balances")
        .select("customer_id, customer_name, customer_area, owed")
        .eq("organization_id", org.id)
        .eq("returnable_item_id", returnable.id)
        .gt("owed", 0)
        .order("customer_name")
    : { data: [] };
  const owing = (balances ?? []).map((row) => ({
    id: row.customer_id,
    name: row.customer_area ? `${row.customer_name} (${row.customer_area})` : row.customer_name,
    owed: Number(row.owed)
  }));
  const word = returnable?.name.toLowerCase() ?? "empties";

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub={`For ${word} a customer still owed from an earlier delivery. They come off what the customer owes and go into the store count.`}>
        Customer brought back {word}
      </PageTitle>
      {!returnable || owing.length === 0 ? (
        <EmptyState title="Nobody owes anything">No customer owes {word} right now.</EmptyState>
      ) : (
        <Card>
          <CustomerReturnForm
            action={recordCustomerEmptiesReturnAction.bind(null, org.slug)}
            returnable={returnable}
            locations={data.locations}
            owing={owing}
            today={todayIn(org.timezone, await requestNow())}
          />
        </Card>
      )}
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
