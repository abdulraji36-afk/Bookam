/**
 * The NBC (Coca-Cola) products Bilikis Store sells, from its price list.
 * A drinks depot can add any of them in one go; each still needs its own
 * selling price and buying cost before it is saved.
 */
export type StarterDrink = { code: string; name: string; category: string; unit: "crate" | "pack" };

export const NBC_PRODUCTS: StarterDrink[] = [
  { code: "C_RGB", name: "COCA COLA ULTRA LS 50CL X24 RGB", category: "RGB", unit: "crate" },
  { code: "F_RGB", name: "FANTA ULTRA 50CL X24 RGB", category: "RGB", unit: "crate" },
  { code: "S_RGB", name: "SPRITE ULTRA 50CL X24 RGB", category: "RGB", unit: "crate" },
  { code: "C_PET_35", name: "COCA COLA 35CL X12 PET", category: "PET", unit: "pack" },
  { code: "F_PET_35", name: "FANTA ORANGE 35CL X12 PET", category: "PET", unit: "pack" },
  { code: "S_PET_35", name: "SPRITE 35CL X12 PET", category: "PET", unit: "pack" },
  { code: "C_PET_50", name: "COCA COLA LS 50CL X12 PET", category: "PET", unit: "pack" },
  { code: "F_PET_50", name: "FANTA ORANGE 50CL X12 PET", category: "PET", unit: "pack" },
  { code: "S_PET_50", name: "SPRITE 50CL X12 PET", category: "PET", unit: "pack" },
  { code: "C_PET_60", name: "COCA COLA LS 60CL X12 PET", category: "PET", unit: "pack" },
  { code: "F_PET_60", name: "FANTA ORANGE 60CL X12 PET", category: "PET", unit: "pack" },
  { code: "S_PET_60", name: "SPRITE 60CL X12 PET", category: "PET", unit: "pack" },
  { code: "CZ_PET_60", name: "COKE ZERO 60CL X12 PET", category: "PET", unit: "pack" },
  { code: "L_PET_60", name: "LIMCA 60CL X12 PET", category: "PET", unit: "pack" },
  { code: "C_PET_100", name: "COCA COLA LS 1L X12 PET", category: "PET", unit: "pack" },
  { code: "SBL_PET_40", name: "SCHWEPPES BITTER LEMON 40CL X12 PET", category: "PET", unit: "pack" },
  { code: "5AOR_PET_30", name: "5ALIVE ORANGE 30CL X12 PET", category: "Juice", unit: "pack" },
  { code: "5ABB_PET_78", name: "FIVE ALIVE BERRY BLAST 78CL X6 PET", category: "Juice", unit: "pack" },
  { code: "5AOR_PET_85", name: "FIVE ALIVE PULPY ORANGE 85CL X6 PET", category: "Juice", unit: "pack" },
  { code: "PG_PET_40", name: "PREDATOR GOLD 40CL X12 PET", category: "Energy", unit: "pack" },
  { code: "ME_CAN_44", name: "MONSTER ENERGY 44CL 4X6 CAN", category: "Energy", unit: "pack" },
  { code: "C_CAN_33", name: "COKE 33CL 4X6 CAN", category: "Can", unit: "pack" },
  { code: "F_CAN_33", name: "FANTA ORANGE 33CL 4X6 CAN", category: "Can", unit: "pack" },
  { code: "S_CAN_33", name: "SPRITE 33CL 4X6 CAN", category: "Can", unit: "pack" },
  { code: "SCH_CAN_33", name: "SCHWEPPES CHAPMAN 33CL 4X6 CAN", category: "Can", unit: "pack" },
  { code: "SMO_CAN_33", name: "SCHWEPPES MOJITO 33CL 4X6 CAN", category: "Can", unit: "pack" },
  { code: "SBL_CAN_33", name: "SCHWEPPES BITTER LEMON 33CL 4X6 CAN", category: "Can", unit: "pack" },
  { code: "SPI_CAN_33", name: "SCHWEPPES PINEAPPLE 33CL 4X6 CAN", category: "Can", unit: "pack" },
  { code: "E_75", name: "EVA WATER 75CL X12 PET", category: "Water", unit: "pack" }
];
