import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/card";
import { SalesHistory } from "../sales-history";

export const metadata: Metadata = { title: "PET transaction history" };

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
