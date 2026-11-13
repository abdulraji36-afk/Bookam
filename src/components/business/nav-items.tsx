import {
  Boxes,
  ChartColumn,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  Settings,
  Truck,
  Undo2,
  UserCog,
  Users,
  type LucideIcon
} from "lucide-react";

export type NavIconName =
  | "dashboard"
  | "orders"
  | "dispatch"
  | "returns"
  | "stock"
  | "products"
  | "customers"
  | "reports"
  | "team"
  | "activity"
  | "settings";

/** A menu entry. Icons are named, not passed, so the list can cross to the browser. */
export type NavItem = { href: string; label: string; icon: NavIconName; exact?: boolean };

export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  dispatch: Truck,
  returns: Undo2,
  stock: Boxes,
  products: Package,
  customers: Users,
  reports: ChartColumn,
  team: UserCog,
  activity: History,
  settings: Settings
};

export function isActivePath(pathname: string, item: Pick<NavItem, "href" | "exact">) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
