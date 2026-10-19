export const TROY_OZ_GRAMS = 31.1034768;

/** USD / troy oz  ->  INR / 10 g  (premium% = import duty vagere) */
export const goldInrPer10g = (usdOz: number, usdInr: number, premiumPct: number) =>
  (usdOz * usdInr) / TROY_OZ_GRAMS * 10 * (1 + premiumPct / 100);

/** USD / troy oz  ->  INR / kg */
export const silverInrPerKg = (usdOz: number, usdInr: number, premiumPct: number) =>
  (usdOz * usdInr) / TROY_OZ_GRAMS * 1000 * (1 + premiumPct / 100);
