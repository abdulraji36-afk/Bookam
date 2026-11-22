import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Transaction records" };

type RecordLink = {
  href: string;
  label: string;
  eyebrow: string;
  body: string;
  dark?: boolean;
};

/** Bilikis's Transaction Records: one place to choose which records to review. */
async function Records({ params }: PageProps<"/b/[slug]/records">) {
  const { slug } = await params;
  const { org, role, t } = await requireOrg(slug);
  if (!org.sells_drinks) notFound();
  const base = `/b/${org.slug}`;
  const manager = canManage(role);

  const groups: { label: string; links: RecordLink[] }[] = [
    {
      label: "Sales & follow-up",
      links: [
        ...(manager
          ? [
              {
                href: `${base}/records/open-work`,
                label: "Incomplete work",
                eyebrow: "Admin watch",
                body: t("Monitor unfinished PET and RGB sales, draft trips and RGB empty returns."),
                dark: true,
              },
            ]
          : []),
        {
          href: `${base}/records/pet`,
          label: t("PET sales"),
          eyebrow: t("Sell PET"),
          body: t("Review PET sales delivered to customers and their dispatch trips."),
        },
        {
          href: `${base}/records/rgb`,
          label: t("RGB sales"),
          eyebrow: t("Sell RGB"),
          body: t("Review RGB sales, their trips and how the empties came back."),
        },
        {
          href: `${base}/returns/shortages`,
          label: t("Empty shortages"),
          eyebrow: "Return shortages",
          body: t("Review customers whose RGB returns came back short."),
        },
      ],
    },
    {
      label: "Stock & depot",
      links: [
        {
          href: `${base}/stock/receipts`,
          label: "Stock in",
          eyebrow: "Inventory",
          body: manager
            ? "Review incoming stock and its buying cost."
            : "Review incoming stock.",
        },
        {
          href: `${base}/returns/exchanges`,
          label: t("Empty exchange"),
          eyebrow: "Depot returns",
          body: t("Review empties handed to the supplier and the RGB cases delivered."),
        },
      ],
    },
    ...(manager
      ? [
          {
            label: "Administrative history",
            links: [
              {
                href: `${base}/records/voided`,
                label: "Voided sales",
                eyebrow: "Protected record",
                body: t("Review PET and RGB sales reversed by an owner or admin."),
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaction records"
        sub="Choose the transaction type you want to review."
      />
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-ink-soft">
            {group.label}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {group.links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-24 flex-col justify-between rounded-md border-2 p-4 transition hover:-translate-y-0.5 ${
                  item.dark
                    ? "border-ink bg-ink text-white"
                    : "border-transparent bg-white hover:border-ink"
                }`}
              >
                <span>
                  <span
                    className={`block text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] ${
                      item.dark ? "text-nav" : "text-ink-soft"
                    }`}
                  >
                    {item.eyebrow}
                  </span>
                  <span className="mt-1 block text-lg font-extrabold leading-tight">
                    {item.label}
                  </span>
                </span>
                <span
                  className={`mt-2 block text-sm ${item.dark ? "text-nav" : "text-ink-soft"}`}
                >
                  {item.body}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Page(props: PageProps<"/b/[slug]/records">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Records {...props} />
    </Suspense>
  );
}
