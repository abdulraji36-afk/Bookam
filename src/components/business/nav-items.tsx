import {
  ArrowLeftRight,
  Banknote,
  Boxes,
  ChartColumn,
  ClipboardList,
  FolderOpen,
  CircleAlert,
  Contact,
  History,
  LayoutDashboard,
  Package,
  PackageCheck,
  Settings,
  Truck,
  Undo2,
  UserCog,
  Users,
  type LucideIcon
} from "lucide-react";

export type NavIconName =
  | "dashboard"
  | "deliveries"
  | "shortages"
  | "exchanges"
  | "orders"
  | "dispatch"
  | "returns"
  | "stock"
  | "products"
  | "customers"
  | "reports"
  | "team"
  | "activity"
  | "settings"
  | "drivers"
  | "value"
  | "records";

/** A menu entry. Icons are named, not passed, so the list can cross to the browser. */
export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  exact?: boolean;
  /** Pages under href that belong to another entry, e.g. Stock in under Stock. */
  excludes?: readonly string[];
};

/** A titled block of entries in the side menu. */
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  dispatch: Truck,
  returns: Undo2,
  stock: Boxes,
  products: Package,
  customers: Users,
  reports: ChartColumn,
  records: FolderOpen,
  team: UserCog,
  activity: History,
  settings: Settings,
  drivers: Contact,
  value: Banknote,
  shortages: CircleAlert,
  deliveries: PackageCheck,
  exchanges: ArrowLeftRight
};

export function isActivePath(pathname: string, item: Pick<NavItem, "href" | "exact" | "excludes">) {
  if (item.excludes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
