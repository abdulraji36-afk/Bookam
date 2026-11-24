/**
 * The words of the depot workspace. Drinks keeps its own (RGB, PET, Empties,
 * crates, packs); a goods depot (any business that counts its goods) says
 * Returnable, Non-returnable and its own name for what comes back, such as
 * "Empty cylinders". Safe to use on the server and in the browser.
 */
export type Trade = "drinks" | "goods";

export type DepotWords = {
  trade: Trade;
  /** "RGB" or "Returnable". */
  returnable: string;
  /** "PET" or "Non-returnable". */
  nonReturnable: string;
  /** What comes back: "Empties", or the goods depot's own name. */
  pool: string;
};

export function depotWords(trade: string | null | undefined, poolName?: string | null): DepotWords {
  if (trade === "goods") {
    return { trade: "goods", returnable: "Returnable", nonReturnable: "Non-returnable", pool: poolName?.trim() || "Returnables" };
  }
  return { trade: "drinks", returnable: "RGB", nonReturnable: "PET", pool: "Empties" };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True where a word starts a heading, a label or a sentence, or stands on its own. */
function startsPhrase(whole: string, offset: number) {
  const before = whole.slice(0, offset).trimEnd();
  return before === "" || /[.:(/\n!?·—-]$/.test(before);
}

/** Keeps the first letter's case of the word it replaces. */
function cased(replacement: string, original: string) {
  if (original[0] === original[0]?.toUpperCase() && original[0] !== original[0]?.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement[0].toLowerCase() + replacement.slice(1);
}

/**
 * Says a drinks sentence in the depot's own words. For drinks it returns the
 * text as it is; for a goods depot it turns RGB, PET, empties, crates, packs
 * and drinks into the goods words. Used for every label, message and report.
 */
export function say(words: DepotWords, text: string): string {
  if (words.trade === "drinks" || !text) return text;
  const pool = words.pool;
  const poolLower = pool.toLowerCase();
  // Longest phrases first, so "Empty shortages" is not read as "Empty" + "shortages".
  const rules: [RegExp, (match: string, offset: number, whole: string) => string][] = [
    [/\b(an?) RGB\b/gi, (m) => cased("a returnable", m)],
    [/\b(an?) PET\b/gi, (m) => cased("a non-returnable", m)],
    [/\bRGB (crates|cases)\b/gi, (_m, offset, whole) => (startsPhrase(whole, offset) ? "Returnable goods" : "returnable goods")],
    [/\bRGB crate\b/gi, (_m, offset, whole) => (startsPhrase(whole, offset) ? "Returnable item" : "returnable item")],
    [/\bRGB returns\b/gi, (_m, offset, whole) => (startsPhrase(whole, offset) ? pool : poolLower)],
    [/\bRGB empty returns\b/gi, () => `${poolLower} coming back`],
    // Mid-sentence it is "returnable"; as a heading, a label or on its own, "Returnable".
    [/\bRGB\b/g, (_m, offset, whole) => (startsPhrase(whole, offset) ? "Returnable" : "returnable")],
    [/\bPET\b/g, (_m, offset, whole) => (startsPhrase(whole, offset) ? "Non-returnable" : "non-returnable")],
    [/\bempty (shortages?)\b/gi, (m) => cased(`return ${m.split(" ")[1].toLowerCase()}`, m)],
    [/\b(supplier|empty) (exchanges)\b/gi, (m) => cased("supplier returns", m)],
    [/\b(supplier|empty) (exchange)\b/gi, (m) => cased("supplier return", m)],
    [/\bexchanges\b/gi, (m) => cased("supplier returns", m)],
    [/\bexchange\b/gi, (m) => cased("supplier return", m)],
    [/\bempty (balances?|adjustments?|movements?|return follow-ups?)\b/gi, (m) => cased(`returns ${m.slice(6).toLowerCase()}`, m)],
    [/\bopening empties\b/gi, (m) => cased(`opening ${poolLower}`, m)],
    [/\bempties\b/gi, (m) => (m[0] === "E" ? pool : poolLower)],
    [/\bempty crates?\b/gi, (m) => (m[0] === "E" ? pool : poolLower)],
    [/\bcrates\b/gi, (m) => cased("units", m)],
    [/\bcrate\b/gi, (m) => cased("unit", m)],
    [/\bpacks\b/gi, (m) => cased("units", m)],
    [/\bpack\b/gi, (m) => cased("unit", m)],
    [/\bdrinks depot\b/gi, (m) => cased("depot", m)],
    [/\bdrinks\b/gi, (m) => cased("goods", m)],
    [/\bdrink\b/gi, (m) => cased("product", m)]
  ];
  let out = text;
  for (const [pattern, replace] of rules) out = out.replace(pattern, (match, ...rest) => replace(match, rest[rest.length - 2] as number, rest[rest.length - 1] as string));
  return out;
}

/** A shortcut bound to one depot's words: t("RGB orders") → "Returnable orders". */
export function sayer(words: DepotWords) {
  return (text: string) => say(words, text);
}

export const DRINKS_WORDS = depotWords("drinks");
export { escape as escapeForPattern };
