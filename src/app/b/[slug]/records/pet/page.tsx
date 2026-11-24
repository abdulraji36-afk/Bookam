import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/card";
import { requireOrg } from "@/lib/org";
import { SalesHistory } from "../sales-history";

/** The tab title in the business's own words ("Return shortages" for goods). */
export async function generateMetadata({ params }: PageProps<"/b/[slug]/records/pet">): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await requireOrg(slug);
  return { title: t("PET transaction history") };
}

async function History({
  params,
  searchParams,
}: PageProps<"/b/[slug]/records/pet">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <SalesHistory slug={slug} query={query} kind="PET" />;
}

export default function Page(props: PageProps<"/b/[slug]/records/pet">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <History {...props} />
    </Suspense>
  );
}
