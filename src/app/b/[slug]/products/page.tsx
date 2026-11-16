import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { FilterBar, PageHeader, StatusTabs } from "@/components/ui/page-header";
import { saveProductOrderAction } from "@/app/actions/catalog";
import { ProductOrderEditor } from "@/components/products/product-order-editor";
import { ProductPicture } from "@/components/products/product-picture";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import { formatMoney, formatQuantity } from "@/lib/format";
import { getSavedProductOrder, sortByProductMasterOrder } from "@/lib/product-order";
import { canManage, requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Products" };

async function Products({ params, searchParams }: PageProps<"/b/[slug]/products">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}/products`;
  const manager = canManage(role);
  // A drinks depot sees every product on one page, in its saved order.
  const drinks = org.sells_drinks;
  const search = readListSearch(query, drinks ? 1000 : 50);
  const showOff = query.status === "off";

  let listQuery = supabase
    .from("products")
    .select("id, name, sku, unit, selling_price, low_stock_threshold, is_active, tracks_serials, category, returnable_items (name)", {
      count: "exact"
    })
    .eq("organization_id", org.id)
    .eq("is_active", !showOff);
  // A phone shop sees its serial-numbered products first, then accessories.
  if (org.selling_mode === "serial") listQuery = listQuery.order("tracks_serials", { ascending: false });
  listQuery = listQuery.order("name").range(search.from, search.to);
  const everyProduct = drinks
    ? supabase
        .from("products")
        .select("id, name, sku, category, is_active, selling_price, returnable_item_id")
        .eq("organization_id", org.id)
        .limit(1000)
    : Promise.resolve({ data: [] });
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["name", "sku"]));

  const [listResult, activeCount, offCount, costsResult, allResult, saved] = await Promise.all([
    listQuery,
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("is_active", true),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("is_active", false),
    manager ? supabase.from("product_costs").select("product_id, cost_price").eq("organization_id", org.id) : Promise.resolve({ data: [] }),
    everyProduct,
    drinks ? getSavedProductOrder(supabase, org.id) : Promise.resolve([] as string[])
  ]);
  const products = drinks ? sortByProductMasterOrder(listResult.data ?? [], saved) : (listResult.data ?? []);
  // Bilikis's product cards, over every product.
  const all = allResult.data ?? [];
  const rgbCount = all.filter((product) => product.returnable_item_id).length;
  const costedIds = new Set((costsResult.data ?? []).map((row) => row.product_id));
  const costed = all.filter((product) => costedIds.has(product.id)).length;
  const priced = all.filter((product) => product.selling_price !== null).length;
  const ordered = sortByProductMasterOrder(
    all
      .filter((product) => product.is_active)
      .map((product) => ({ ...product, category: product.returnable_item_id ? "RGB" : (product.category ?? "PET") })),
    saved
  );
  const costs = new Map((costsResult.data ?? []).map((row) => [row.product_id, Number(row.cost_price)]));
  const money = (value: number | null | undefined) =>
    value == null ? <span className="text-ink-soft">—</span> : formatMoney(Number(value), org.currency_code);
  const href = (status: string, page = 1) => {
    const params = new URLSearchParams();
    if (status === "off") params.set("status", "off");
    if (search.q) params.set("q", search.q);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return `${base}${text ? `?${text}` : ""}`;
  };

  type Product = (typeof products)[number];
  const kind = (product: Product) =>
    org.sells_drinks
      ? product.returnable_items
        ? "RGB"
        : (product.category ?? "PET")
      : product.tracks_serials
        ? "Serial numbers"
        : product.returnable_items
          ? `Return: ${product.returnable_items.name}`
          : org.selling_mode === "serial"
            ? "Counted"
            : null;
  const showKind = org.sells_drinks || org.tracks_serials || org.tracks_returns;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        sub={manager ? "What you sell. Open a product to change it or switch it off." : "What the business sells."}
        actions={
          manager ? (
            <>
              <Link href={`${base}/new`} className={buttonClass("primary")}>
                + New product
              </Link>
              {org.sells_drinks ? (
                <Link href={`${base}/nbc`} className={buttonClass("secondary")}>
                  Add from the NBC list
                </Link>
              ) : null}
            </>
          ) : null
        }
      />

      {typeof query.added === "string" && /^\d{1,3}$/.test(query.added) ? (
        <Alert tone="success">{query.added === "1" ? "1 product added." : `${query.added} products added.`}</Alert>
      ) : null}

      {drinks ? (
        <SummaryCards columns={4}>
          <SummaryCard label="Total products" value={formatQuantity(all.length)} />
          <SummaryCard label="PET vs RGB" value={`${formatQuantity(all.length - rgbCount)} / ${formatQuantity(rgbCount)}`} />
          <SummaryCard label="Active products" value={formatQuantity(activeCount.count ?? 0)} />
          <SummaryCard
            label={manager ? "Costed / priced" : "Priced"}
            value={manager ? `${formatQuantity(costed)} / ${formatQuantity(priced)}` : formatQuantity(priced)}
          />
        </SummaryCards>
      ) : null}

      {drinks && manager && ordered.length > 1 ? (
        <details className="overflow-hidden rounded-md bg-white">
          <summary className="cursor-pointer select-none px-5 py-3 font-extrabold uppercase tracking-wide">
            Reorder products
          </summary>
          <p className="border-t border-line px-5 pt-3 text-sm text-ink-soft">
            Put the products in the order you think in. The order screen, stock summary, daily report and inventory value
            follow it.
          </p>
          <ProductOrderEditor
            action={saveProductOrderAction.bind(null, org.slug)}
            items={ordered.map((product) => ({
              id: product.id,
              name: product.name,
              category: product.category,
              picture: <ProductPicture sku={product.sku} name={product.name} />
            }))}
          />
        </details>
      ) : null}

      <FilterBar>
        <SearchForm action={base} q={search.q} label="Search products" placeholder="Search by name or code" />
        <StatusTabs
          label="Product status"
          current={showOff ? "off" : "active"}
          hrefFor={(value) => href(value)}
          tabs={[
            { value: "active", label: "In use", count: activeCount.count ?? 0 },
            { value: "off", label: "Switched off", count: offCount.count ?? 0 }
          ]}
        />
      </FilterBar>

      {(activeCount.count ?? 0) + (offCount.count ?? 0) === 0 ? (
        <EmptyState title="No products yet">
          {manager ? "Add the first thing you sell to start tracking stock." : "An owner or admin needs to add products."}
        </EmptyState>
      ) : search.q && products.length === 0 ? (
        <NoMatches q={search.q} base={base} />
      ) : (
        <TableCard>
          <DataTable
            label="Products"
            rows={products}
            rowKey={(product: Product) => product.id}
            rowHref={manager ? (product: Product) => `${base}/${product.id}` : undefined}
            empty={showOff ? "No products are switched off." : "No products in use."}
            columns={[
              {
                header: "Product",
                wrap: true,
                cell: (product: Product) =>
                  drinks ? (
                    <span className="flex items-center gap-3">
                      <ProductPicture sku={product.sku} name={product.name} />
                      {product.name}
                    </span>
                  ) : (
                    product.name
                  )
              },
              ...(showKind
                ? [
                    {
                      header: org.sells_drinks ? "Type" : "Kind",
                      phone: "badge" as const,
                      cell: (product: Product) =>
                        kind(product) ? (
                          <Badge tone={product.returnable_items || product.tracks_serials ? "solid" : "plain"}>{kind(product)}</Badge>
                        ) : null
                    }
                  ]
                : []),
              { header: "Code", cell: (product: Product) => product.sku ?? <span className="text-ink-soft">—</span> },
              { header: "Unit", cell: (product: Product) => product.unit },
              { header: "Price", align: "right" as const, cell: (product: Product) => money(product.selling_price) },
              ...(manager
                ? [{ header: "Cost", align: "right" as const, cell: (product: Product) => money(costs.get(product.id)) }]
                : []),
              {
                header: "Warn at",
                align: "right" as const,
                phone: "hide" as const,
                cell: (product: Product) =>
                  Number(product.low_stock_threshold) > 0 ? (
                    formatQuantity(Number(product.low_stock_threshold))
                  ) : (
                    <span className="text-ink-soft">—</span>
                  )
              }
            ]}
          />
        </TableCard>
      )}
      <Pager base={base} search={search} total={listResult.count ?? 0} hrefFor={(page) => href(showOff ? "off" : "active", page)} />
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
