import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Manage" };

/** Bilikis's Manage page: the records an owner or admin keeps up to date. */
async function Manage({ params }: PageProps<"/b/[slug]/manage">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug, MANAGER_ROLES);
  const base = `/b/${org.slug}`;
  const links = [
    {
      href: `${base}/products`,
      eyebrow: "Product master",
      label: "Products",
      body: "Create products, set buying cost and selling price, and switch products on or off.",
    },
    {
      href: `${base}/customers`,
      eyebrow: "Customer records",
      label: "Customers",
      body: "Keep the customers you sell to, with their phone and area.",
    },
    ...(org.does_delivery
      ? [
          {
            href: `${base}/dispatch/crew`,
            eyebrow: "Dispatch team",
            label: "Drivers / workers",
            body: "Manage the people chosen on dispatch trips.",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Manage" sub="Choose the records you want to set up or change." />
      <div className="grid grid-cols-2 gap-3">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-24 flex-col justify-between rounded-md border-2 border-transparent bg-white p-4 transition hover:-translate-y-0.5 hover:border-ink"
          >
            <span>
              <span className="block text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-ink-soft">
                {item.eyebrow}
              </span>
              <span className="mt-1 block text-lg font-extrabold leading-tight">{item.label}</span>
            </span>
            <span className="mt-2 block text-sm text-ink-soft">{item.body}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/b/[slug]/manage">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Manage {...props} />
    </Suspense>
  );
}
