import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/card";

/**
 * Stock is the Stock in list (every delivery received). What is in stock now
 * is on its own page, Stock summary; old links to the stock counts go there.
 */
async function Stock({ params, searchParams }: PageProps<"/b/[slug]/stock">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const counts = new URLSearchParams();
  if (typeof query.show === "string") counts.set("show", query.show);
  if (typeof query.location === "string")
    counts.set("location", query.location);
  if (counts.size > 0)
    return redirect(`/b/${slug}/stock/summary?${counts.toString()}`);
  return redirect(`/b/${slug}/stock/receipts`);
}

export default function StockPage(props: PageProps<"/b/[slug]/stock">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Stock {...props} />
    </Suspense>
  );
}
