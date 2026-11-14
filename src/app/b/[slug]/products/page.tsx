import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setProductActiveAction } from "@/app/actions/catalog";
import { ActionButton } from "@/components/team/action-button";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { Badge, Card, EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Products" };

async function Products({ params, searchParams }: PageProps<"/b/[slug]/products">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}/products`;
  const manager = canManage(role);

  const search = readListSearch(query, 50);

  let listQuery = supabase
    .from("products")
    .select("id, name, sku, unit, selling_price, is_active, tracks_serials, returnable_items (name)", {
      count: "exact"
    })
    .eq("organization_id", org.id)
    .order("is_active", { ascending: false });
  // A phone shop sees its serial-numbered products first, then accessories.
  if (org.selling_mode === "serial") listQuery = listQuery.order("tracks_serials", { ascending: false });
  listQuery = listQuery.order("name").range(search.from, search.to);
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["name", "sku"]));
  const { data, count } = await listQuery;
  const products = data ?? [];
  type ProductRow = (typeof products)[number];
  const groups: [string | null, ProductRow[]][] =
    org.selling_mode === "serial"
      ? (
          [
            ["With serial numbers", products.filter((product) => product.tracks_serials)],
            ["Counted items", products.filter((product) => !product.tracks_serials)]
          ] as [string, ProductRow[]][]
        ).filter(([, rows]) => rows.length > 0)
      : [[null, products]];

  return (
    <div className="space-y-6">
      <div className="page-head">
        <PageTitle
          sub={
            org.selling_mode === "serial"
              ? "Items sold one by one by serial number, and accessories you simply count."
              : org.tracks_returns
                ? "What you sell, and whether customers must bring something back."
                : "What you sell."
          }
        >
          Products
        </PageTitle>
        {manager ? (
          <div className="flex flex-wrap gap-2">
            {org.sells_drinks ? (
              <Link href={`${base}/nbc`} className={buttonClass("secondary")}>
                Add from the NBC list
              </Link>
            ) : null}
            <Link href={`${base}/new`} className={buttonClass("primary")}>
              + New product
            </Link>
          </div>
        ) : null}
      </div>

      {typeof query.added === "string" && /^\d{1,3}$/.test(query.added) ? (
        <Alert tone="success">
          {query.added === "1" ? "1 product added." : `${query.added} products added.`}
        </Alert>
      ) : null}

      {products.length > 0 || search.q ? (
        <SearchForm action={base} q={search.q} label="Search products" placeholder="Search by name or SKU" />
      ) : null}

      {products.length === 0 && search.q ? (
        <NoMatches q={search.q} base={base} />
      ) : products.length === 0 ? (
        <EmptyState title="No products yet">
          {manager
            ? "Add the first thing you sell to start tracking stock."
            : "An owner or admin needs to add products."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map(([title, rows]) => {
            const list = (
              <ul className="divide-y divide-line">
                {rows.map((product) => (
                  <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className={`text-lg font-extrabold ${product.is_active ? "" : "text-ink-soft line-through"}`}>
                        {product.name}
                      </p>
                      <p className="font-medium text-ink-soft">
                        Per {product.unit} · {formatMoney(product.selling_price, org.currency_code)}
                        {product.sku ? ` · ${product.sku}` : ""}
                        {product.returnable_items || !org.tracks_returns || org.sells_drinks ? "" : " · No return"}
                        {product.tracks_serials && org.selling_mode !== "serial" ? " · Serial numbers" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!product.is_active ? <Badge tone="accent">Switched off</Badge> : null}
                      {org.sells_drinks ? (
                        <Badge tone={product.returnable_items ? "solid" : "plain"}>
                          {product.returnable_items ? "RGB · empties back" : "PET"}
                        </Badge>
                      ) : product.returnable_items ? (
                        <Badge tone="solid">Return due: {product.returnable_items.name}</Badge>
                      ) : null}
                      {manager ? (
                        <>
                          <Link href={`${base}/${product.id}`} className={buttonClass("secondary", "sm")}>
                            Edit
                          </Link>
                          <ActionButton
                            action={setProductActiveAction.bind(null, org.slug, product.id, !product.is_active)}
                            label={product.is_active ? "Switch off" : "Switch on"}
                            variant={product.is_active ? "danger" : "secondary"}
                          />
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            );
            return title ? (
              <ListCard key={title} title={title}>
                {list}
              </ListCard>
            ) : (
              <Card key="all" className="!p-0">
                {list}
              </Card>
            );
          })}
        </div>
      )}
      <Pager base={base} search={search} total={count ?? 0} />
    </div>
  );
}

export default function ProductsPage(props: PageProps<"/b/[slug]/products">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Products {...props} />
    </Suspense>
  );
}
