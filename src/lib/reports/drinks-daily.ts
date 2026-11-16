import "server-only";
import {
  ADD_REASONS,
  ORDER_STATUS_LABELS,
  SUBTRACT_REASONS,
  TRIP_STATUS_LABELS,
} from "@/lib/format";
import { sortByProductMasterOrder } from "@/lib/product-order";
import type { ServerClient } from "@/lib/supabase/server";

/**
 * The Bilikis Daily Operations report, for a drinks depot: what happened on
 * one day, and the depot as it stood at the close of it. A record stays on
 * the day it happened; later dispatches, returns and reversals appear on
 * their own days.
 */

export type Activity = {
  activity: string;
  records: number;
  quantity: string;
  detail: string;
};
export type Line = {
  reference: string;
  time: string;
  party: string;
  products: string;
  quantity: number;
  value: number | null;
  status: string;
};
export type Dispatch = {
  channel: string;
  time: string;
  reference: string;
  driver: string;
  customers: string;
  quantity: number;
  status: string;
};
export type EmptyMovement = {
  activity: string;
  time: string;
  reference: string;
  party: string;
  quantity: number;
  note: string;
};
export type Exception = {
  event: string;
  time: string;
  reference: string;
  reason: string;
  impact: string;
};
export type ProductMovement = {
  code: string;
  name: string;
  category: string;
  unit: string;
  opening: number;
  received: number;
  issued: number;
  closing: number;
};
export type OpenWork = {
  petWaiting: number;
  rgbWaiting: number;
  draftTrips: number;
  waitingReturns: number;
  shortageFollowUps: number;
};

export type DrinksDaily = {
  petClosing: number;
  rgbClosing: number;
  emptiesAtClose: number | null;
  openWork: OpenWork;
  activity: Activity[];
  stockReceived: (Line & { cost: number | null })[];
  petSales: Line[];
  rgbSales: Line[];
  dispatches: Dispatch[];
  emptyMovements: EmptyMovement[];
  exceptions: Exception[];
  products: ProductMovement[];
};

/** The start and end of a day in the business's time zone, as instants. */
export function dayBounds(day: string, timeZone: string) {
  const guess = Date.parse(`${day}T00:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, part.value]),
  );
  const asLocal = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  const start = guess - (asLocal - guess);
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + 86_400_000).toISOString(),
  };
}

const sum = <T>(rows: T[], value: (row: T) => number) =>
  rows.reduce((total, row) => total + value(row), 0);
const count = (value: number) => new Intl.NumberFormat("en-NG").format(value);
const signed = (value: number) =>
  value > 0 ? `+${count(value)}` : value < 0 ? `−${count(-value)}` : "0";
const REASONS = new Map<string, string>([
  ...ADD_REASONS,
  ...SUBTRACT_REASONS,
  ["opening_count", "Opening empties"],
]);

type Item = {
  product_id: string;
  quantity: number;
  line_total?: number | null;
  returnable_item_id: string | null;
};

export async function getDrinksDaily(
  supabase: ServerClient,
  organizationId: string,
  day: string,
  timeZone: string,
  manager: boolean,
): Promise<{ data: DrinksDaily | null; error: string | null }> {
  const { start, end } = dayBounds(day, timeZone);
  const time = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-NG", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(value))
      : "—";

  const [
    products,
    stock,
    empties,
    receipts,
    orders,
    dispatched,
    returnsLines,
    followups,
    exchanges,
    adjustments,
    voided,
    cancelledTrips,
    openOrders,
    openTrips,
    shortLines,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, unit, category, returnable_item_id")
      .eq("organization_id", organizationId),
    supabase.rpc("daily_stock_report", {
      p_organization_id: organizationId,
      p_date: day,
    }),
    supabase.rpc("empties_summary", {
      p_organization_id: organizationId,
      p_date: day,
    }),
    supabase
      .from("stock_receipts")
      .select(
        "id, receipt_no, supplier_name, reference, created_at, stock_receipt_items (id, product_id, quantity)",
      )
      .eq("organization_id", organizationId)
      .eq("received_date", day)
      .is("voided_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select(
        "id, order_no, status, voided_at, created_at, buyer_name, customers (name), order_items (product_id, quantity, line_total, returnable_item_id)",
      )
      .eq("organization_id", organizationId)
      .eq("order_date", day)
      .order("created_at", { ascending: false }),
    supabase
      .from("dispatch_trips")
      .select(
        "id, trip_no, driver_name, status, dispatched_at, dispatch_trip_orders (orders (voided_at, buyer_name, customers (name), order_items (product_id, quantity, returnable_item_id)))",
      )
      .eq("organization_id", organizationId)
      .gte("dispatched_at", start)
      .lt("dispatched_at", end)
      .order("dispatched_at", { ascending: false }),
    supabase
      .from("trip_return_lines")
      .select(
        "id, expected_quantity, returned_quantity, dispatch_trips!inner (trip_no, returned_date, returns_recorded_at), orders (voided_at, buyer_name, customers (name))",
      )
      .eq("organization_id", organizationId)
      .eq("dispatch_trips.returned_date", day),
    supabase
      .from("empties_followups")
      .select(
        "id, quantity, note, created_at, trip_return_lines (dispatch_trips (trip_no), orders (customers (name)))",
      )
      .eq("organization_id", organizationId)
      .eq("received_date", day)
      .is("voided_at", null),
    supabase
      .from("supplier_exchanges")
      .select(
        "id, exchange_no, reference, crates_delivered, quantity_taken, note, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("exchange_date", day)
      .is("voided_at", null),
    supabase
      .from("returnable_adjustments")
      .select("id, quantity_delta, reason, note, created_at")
      .eq("organization_id", organizationId)
      .eq("adjustment_date", day)
      .is("voided_at", null),
    supabase
      .from("orders")
      .select(
        "id, order_no, voided_at, void_reason, order_items (quantity, returnable_item_id)",
      )
      .eq("organization_id", organizationId)
      .gte("voided_at", start)
      .lt("voided_at", end),
    supabase
      .from("dispatch_trips")
      .select("id, trip_no, updated_at")
      .eq("organization_id", organizationId)
      .eq("status", "cancelled")
      .is("dispatched_at", null)
      .gte("updated_at", start)
      .lt("updated_at", end),
    // Orders that may have been waiting at the close of the day: still
    // waiting now, or changed after the day ended.
    supabase
      .from("orders")
      .select(
        "id, status, voided_at, updated_at, handed_over_at, order_items (returnable_item_id), dispatch_trip_orders (dispatch_trips (dispatched_at))",
      )
      .eq("organization_id", organizationId)
      .lte("order_date", day)
      .lt("created_at", end)
      .or(`status.eq.pending,updated_at.gte.${end}`),
    supabase
      .from("dispatch_trips")
      .select(
        "id, status, created_at, updated_at, dispatched_at, returns_recorded_at",
      )
      .eq("organization_id", organizationId)
      .lt("created_at", end)
      .or(`status.in.(draft,dispatched),updated_at.gte.${end}`),
    // Orders that came back short by the close of the day (the shortage lines).
    supabase
      .from("empty_shortage_lines")
      .select("id, expected, initial_returned")
      .eq("organization_id", organizationId)
      .lt("returned_at", end),
  ]);

  const failed = [
    products,
    stock,
    empties,
    receipts,
    orders,
    dispatched,
    returnsLines,
    followups,
    exchanges,
    adjustments,
    voided,
    cancelledTrips,
    openOrders,
    openTrips,
    shortLines,
  ].find((result) => result.error);
  if (failed?.error) {
    console.error("Daily operations could not load:", failed.error);
    return {
      data: null,
      error: "Daily operations could not be loaded. Please try again.",
    };
  }

  const productById = new Map(
    (products.data ?? []).map((product) => [product.id, product]),
  );
  const isRgb = (item: { returnable_item_id: string | null }) =>
    item.returnable_item_id !== null;
  const describe = (items: { product_id: string; quantity: number }[]) =>
    items
      .map(
        (item) =>
          `${productById.get(item.product_id)?.name ?? "Product"} (${count(Number(item.quantity))})`,
      )
      .join(", ") || "—";
  const customerOf = (
    order: {
      customers: { name: string } | null;
      buyer_name?: string | null;
    } | null,
  ) => order?.customers?.name ?? order?.buyer_name ?? "Customer";

  // Costs are for owners and admins only.
  const itemIds = (receipts.data ?? []).flatMap((receipt) =>
    receipt.stock_receipt_items.map((item) => item.id),
  );
  const { data: costs } =
    manager && itemIds.length
      ? await supabase
          .from("stock_receipt_item_costs")
          .select("receipt_item_id, unit_cost")
          .in("receipt_item_id", itemIds)
      : { data: [] };
  const costByItem = new Map(
    (costs ?? []).map((cost) => [cost.receipt_item_id, Number(cost.unit_cost)]),
  );

  const stockReceived = (receipts.data ?? []).map((receipt) => {
    const items = receipt.stock_receipt_items;
    const costed = items.every((item) => costByItem.has(item.id));
    return {
      reference: receipt.receipt_no,
      time: time(receipt.created_at),
      party:
        [receipt.supplier_name, receipt.reference]
          .filter(Boolean)
          .join(" - ") || "—",
      products: describe(items),
      quantity: sum(items, (item) => Number(item.quantity)),
      value: null,
      status: "Received",
      cost:
        manager && costed && items.length
          ? sum(
              items,
              (item) => Number(item.quantity) * (costByItem.get(item.id) ?? 0),
            )
          : null,
    };
  });

  const saleLine = (order: NonNullable<typeof orders.data>[number]): Line => ({
    reference: order.order_no,
    time: time(order.created_at),
    party: customerOf(order),
    products: describe(order.order_items),
    quantity: sum(order.order_items, (item) => Number(item.quantity)),
    value: sum(order.order_items, (item) => Number(item.line_total ?? 0)),
    status: order.voided_at ? "Voided" : ORDER_STATUS_LABELS[order.status],
  });
  const dayOrders = orders.data ?? [];
  const rgbOrders = dayOrders.filter((order) => order.order_items.some(isRgb));
  const petOrders = dayOrders.filter((order) => !order.order_items.some(isRgb));

  // Dispatches: one trip can carry RGB and PET.
  const dispatches: Dispatch[] = [];
  let rgbTrips = 0;
  let petTrips = 0;
  let rgbOut = 0;
  let petOut = 0;
  for (const trip of dispatched.data ?? []) {
    const tripOrders = trip.dispatch_trip_orders
      .map((link) => link.orders)
      .filter((order) => order && !order.voided_at);
    const items: Item[] = tripOrders.flatMap((order) => order!.order_items);
    const rgb = sum(items.filter(isRgb), (item) => Number(item.quantity));
    const pet = sum(
      items.filter((item) => !isRgb(item)),
      (item) => Number(item.quantity),
    );
    if (rgb > 0) rgbTrips += 1;
    if (pet > 0) petTrips += 1;
    rgbOut += rgb;
    petOut += pet;
    dispatches.push({
      channel: rgb > 0 && pet > 0 ? "RGB + PET" : rgb > 0 ? "RGB" : "PET",
      time: time(trip.dispatched_at),
      reference: trip.trip_no,
      driver: trip.driver_name || "—",
      customers:
        [...new Set(tripOrders.map((order) => customerOf(order)))].join(", ") ||
        "—",
      quantity: rgb + pet,
      status: TRIP_STATUS_LABELS[trip.status],
    });
  }

  const lines = (returnsLines.data ?? []).filter(
    (line) => !line.orders?.voided_at,
  );
  const returned = sum(lines, (line) => Number(line.returned_quantity));
  const expected = sum(lines, (line) => Number(line.expected_quantity));
  const followupRows = followups.data ?? [];
  const followupTotal = sum(followupRows, (row) => Number(row.quantity));
  const exchangeRows = exchanges.data ?? [];
  const adjustmentRows = adjustments.data ?? [];
  const voidedRows = voided.data ?? [];
  const cancelledRows = cancelledTrips.data ?? [];

  const activity: Activity[] = [
    {
      activity: "Stock received",
      records: stockReceived.length,
      quantity: `${count(sum(stockReceived, (row) => row.quantity))} units in`,
      detail: "Posted stock-in records",
    },
    {
      activity: "PET sales recorded",
      records: petOrders.length,
      quantity: `${count(sum(petOrders, (order) => sum(order.order_items, (item) => Number(item.quantity))))} packs`,
      detail: "Saved on this date, including work dispatched later",
    },
    {
      activity: "RGB sales recorded",
      records: rgbOrders.length,
      quantity: `${count(sum(rgbOrders, (order) => sum(order.order_items, (item) => Number(item.quantity))))} crates`,
      detail: "Saved on this date, including work dispatched later",
    },
    {
      activity: "PET dispatched",
      records: petTrips,
      quantity: `${count(petOut)} packs out`,
      detail: "Trips actually dispatched on this date",
    },
    {
      activity: "RGB dispatched",
      records: rgbTrips,
      quantity: `${count(rgbOut)} crates out`,
      detail: "Trips actually dispatched on this date",
    },
    {
      activity: "Initial RGB returns",
      records: lines.length,
      quantity: `${count(returned)} empties received`,
      detail: `${count(expected)} empties expected at closure`,
    },
    {
      activity: "Empty return follow-ups",
      records: followupRows.length,
      quantity: `${count(followupTotal)} empties received`,
      detail: "Later collections from previously short customer returns",
    },
    {
      activity: "NBC empty exchange",
      records: exchangeRows.length,
      quantity: `${count(sum(exchangeRows, (row) => Number(row.quantity_taken)))} empties out`,
      detail: `${count(sum(exchangeRows, (row) => Number(row.crates_delivered ?? 0)))} RGB cases delivered by NBC`,
    },
    {
      activity: "Empty adjustments",
      records: adjustmentRows.length,
      quantity: signed(
        sum(adjustmentRows, (row) => Number(row.quantity_delta)),
      ),
      detail: "Purchases, corrections, or depot losses recorded by admin",
    },
    ...(manager
      ? [
          {
            activity: "Voided sales",
            records: voidedRows.length,
            quantity: `${count(sum(voidedRows, (order) => sum(order.order_items, (item) => Number(item.quantity))))} units returned to stock`,
            detail: "Sales reversals completed by an owner or admin",
          },
          {
            activity: "Cancelled draft trips",
            records: cancelledRows.length,
            quantity: "No stock movement",
            detail: "Draft dispatches cancelled before delivery",
          },
        ]
      : []),
  ];

  const emptyMovements: (EmptyMovement & { at: string })[] = [
    ...lines.map((line) => ({
      activity: "RGB trip return",
      at: line.dispatch_trips.returns_recorded_at ?? "",
      time: time(line.dispatch_trips.returns_recorded_at),
      reference: line.dispatch_trips.trip_no,
      party: customerOf(line.orders),
      quantity: Number(line.returned_quantity),
      note: `${count(Number(line.expected_quantity))} expected`,
    })),
    ...followupRows.map((row) => ({
      activity: "Return follow-up",
      at: row.created_at,
      time: time(row.created_at),
      reference: row.trip_return_lines?.dispatch_trips?.trip_no ?? "—",
      party: row.trip_return_lines?.orders?.customers?.name ?? "Customer",
      quantity: Number(row.quantity),
      note: row.note ?? "",
    })),
    ...exchangeRows.map((row) => ({
      activity: "NBC empty exchange",
      at: row.created_at,
      time: time(row.created_at),
      reference: row.exchange_no || row.reference || "—",
      party: "NBC",
      quantity: -Number(row.quantity_taken),
      note: row.note ?? "",
    })),
    ...adjustmentRows.map((row) => ({
      activity: "Empty adjustment",
      at: row.created_at,
      time: time(row.created_at),
      reference: REASONS.get(row.reason) ?? row.reason,
      party: "Depot",
      quantity: Number(row.quantity_delta),
      note: row.note ?? "",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const exceptions: (Exception & { at: string })[] = manager
    ? [
        ...voidedRows.map((order) => ({
          event: order.order_items.some(isRgb)
            ? "RGB sale voided"
            : "PET sale voided",
          at: order.voided_at ?? "",
          time: time(order.voided_at),
          reference: order.order_no,
          reason: order.void_reason || "No reason recorded",
          impact: "Stock returned to depot",
        })),
        ...cancelledRows.map((trip) => ({
          event: "Draft trip cancelled",
          at: trip.updated_at,
          time: time(trip.updated_at),
          reference: trip.trip_no,
          reason: "Cancelled before dispatch",
          impact: "No stock movement",
        })),
      ].sort((a, b) => b.at.localeCompare(a.at))
    : [];

  // Follow-ups received by the close of the day, on those shortage lines.
  const shortIds = (shortLines.data ?? []).map((line) => line.id);
  const { data: laterReturns, error: laterError } = shortIds.length
    ? await supabase
        .from("empties_followups")
        .select("trip_return_line_id, quantity")
        .in("trip_return_line_id", shortIds)
        .is("voided_at", null)
        .lte("received_date", day)
    : { data: [], error: null };
  if (laterError) {
    console.error("Daily operations could not load:", laterError);
    return {
      data: null,
      error: "Daily operations could not be loaded. Please try again.",
    };
  }
  const laterByLine = new Map<string, number>();
  for (const row of laterReturns ?? []) {
    laterByLine.set(
      row.trip_return_line_id,
      (laterByLine.get(row.trip_return_line_id) ?? 0) + Number(row.quantity),
    );
  }

  // Work still open at the close of the day.
  const waitingAtClose = (openOrders.data ?? []).filter((order) => {
    if (order.voided_at && order.voided_at < end) return false;
    if (
      order.status === "cancelled" &&
      !order.voided_at &&
      order.updated_at < end
    )
      return false;
    if (order.handed_over_at && order.handed_over_at < end) return false;
    // An order is on at most one trip.
    const dispatchedAt =
      order.dispatch_trip_orders?.dispatch_trips?.dispatched_at;
    return !(dispatchedAt && dispatchedAt < end);
  });
  const trips = openTrips.data ?? [];
  const openWork: OpenWork = {
    rgbWaiting: waitingAtClose.filter((order) => order.order_items.some(isRgb))
      .length,
    petWaiting: waitingAtClose.filter((order) => !order.order_items.some(isRgb))
      .length,
    draftTrips: trips.filter(
      (trip) =>
        !(trip.dispatched_at && trip.dispatched_at < end) &&
        !(trip.status === "cancelled" && trip.updated_at < end),
    ).length,
    waitingReturns: trips.filter(
      (trip) =>
        trip.dispatched_at &&
        trip.dispatched_at < end &&
        !(trip.returns_recorded_at && trip.returns_recorded_at < end),
    ).length,
    shortageFollowUps: (shortLines.data ?? []).filter(
      (line) =>
        Number(line.expected) -
          Number(line.initial_returned) -
          (laterByLine.get(line.id) ?? 0) >
        0,
    ).length,
  };

  const productRows: ProductMovement[] = (stock.data ?? []).map((row) => {
    const product = productById.get(row.product_id);
    return {
      code: product?.sku ?? "—",
      name: row.name,
      category: product?.returnable_item_id
        ? "RGB"
        : (product?.category ?? "PET"),
      unit: row.unit,
      opening: Number(row.opening),
      received: Number(row.received),
      issued: Number(row.sold),
      closing: Number(row.closing),
    };
  });

  return {
    data: {
      petClosing: sum(
        productRows.filter((row) => row.category !== "RGB"),
        (row) => row.closing,
      ),
      rgbClosing: sum(
        productRows.filter((row) => row.category === "RGB"),
        (row) => row.closing,
      ),
      emptiesAtClose: empties.data?.[0]
        ? Number(empties.data[0].in_store)
        : null,
      openWork,
      activity,
      stockReceived,
      petSales: petOrders.map(saleLine),
      rgbSales: rgbOrders.map(saleLine),
      dispatches,
      emptyMovements,
      exceptions,
      // In Bilikis's NBC product order, RGB crates first.
      products: sortByProductMasterOrder(
        productRows.map((row) => ({
          ...row,
          sku: row.code === "—" ? null : row.code,
        })),
      ).map(({ sku: _sku, ...row }) => row),
    },
    error: null,
  };
}
