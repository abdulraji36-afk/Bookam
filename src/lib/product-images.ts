/**
 * Pictures for the NBC products, as in Bilikis, found by product code.
 * Products with another code show their first letters instead.
 */
const CODES = new Set([
  "5ABB_PET_78", "5ACO_PET_78", "5AOR_PET_30", "5AOR_PET_85", "CZ_PET_60", "C_CAN_33", "C_PET_100",
  "C_PET_35", "C_PET_50", "C_PET_60", "C_RGB", "E_75", "F_CAN_33", "F_PET_35", "F_PET_50", "F_PET_60",
  "F_RGB", "L_PET_60", "L_RGB_50", "ME_CAN_44", "PG_PET_40", "PM_PET_40", "SBL_CAN_33", "SBL_PET_40",
  "SCH_CAN_33", "SMO_CAN_33", "SPI_CAN_33", "S_CAN_33", "S_PET_35", "S_PET_50", "S_PET_60", "S_RGB"
]);

export function productImage(sku: string | null) {
  const code = sku?.trim().toUpperCase() ?? "";
  return CODES.has(code) ? `/images/products/${code}.webp` : null;
}
