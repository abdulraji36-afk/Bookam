import { categoryOrder } from "@/lib/format";

/**
 * The order Bilikis lists NBC products in (its product master order): RGB
 * crates first, then PET by size, juices, energy, cans and water. Products
 * not on the list follow, by category and then name.
 */
const PRODUCT_MASTER_ORDER = [
  "C_RGB",
  "F_RGB",
  "S_RGB",
  "C_PET_60",
  "F_PET_60",
  "S_PET_60",
  "C_PET_50",
  "F_PET_50",
  "S_PET_50",
  "C_PET_35",
  "F_PET_35",
  "S_PET_35",
  "L_PET_60",
  "5AOR_PET_30",
  "5AOR_PET_85",
  "5ABB_PET_78",
  "PG_PET_40",
  "ME_CAN_44",
  "SBL_PET_40",
  "C_PET_100",
  "CZ_PET_60",
  "SCH_CAN_33",
  "SMO_CAN_33",
  "SBL_CAN_33",
  "SPI_CAN_33",
  "C_CAN_33",
  "F_CAN_33",
  "S_CAN_33",
  "E_75",
] as const;

const position = new Map<string, number>(
  PRODUCT_MASTER_ORDER.map((code, index) => [code, index]),
);

export function sortByProductMasterOrder<
  T extends { sku: string | null; name: string; category: string | null },
>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aIndex = position.get(a.sku ?? "") ?? Number.MAX_SAFE_INTEGER;
    const bIndex = position.get(b.sku ?? "") ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return (
      categoryOrder(a.category) - categoryOrder(b.category) ||
      a.name.localeCompare(b.name)
    );
  });
}
