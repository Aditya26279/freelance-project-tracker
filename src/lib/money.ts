/** All amounts are integer minor units (cents/paise). Every supported currency has 2 decimals. */

/** Upper bound for any single amount: 10 billion major units, well within Int and provider limits. */
export const MAX_AMOUNT = 1_000_000_000_000;

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

/** Parse user input like "1,250.50" into minor units. Returns NaN on garbage. */
export function parseMoney(input: string | null | undefined): number {
  if (input == null) return NaN;
  const cleaned = String(input).replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  if (cleaned === "" || !/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "-" || cleaned === ".") return NaN;
  const value = Math.round(parseFloat(cleaned) * 100);
  return Math.abs(value) > MAX_AMOUNT ? NaN : value;
}

/** Like parseMoney but rejects negatives. Empty input → `fallback`. */
export function parseAmount(input: string | null | undefined, fallback = 0): number {
  if (input == null || String(input).trim() === "") return fallback;
  const v = parseMoney(input);
  return v >= 0 ? v : NaN;
}

/** Tax percent input ("18", "7.5") → basis points, clamped to 0–100%. NaN on garbage. */
export function parseTaxPercent(input: FormDataEntryValue | null | undefined): number {
  const s = String(input ?? "").trim();
  if (s === "") return 0;
  const pct = Number(s);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NaN;
  return Math.round(pct * 100);
}

export function toInputAmount(minor: number): string {
  return (minor / 100).toFixed(2);
}

export interface LineLike {
  quantity: number;
  unitAmount: number;
}

export function lineAmount(line: LineLike): number {
  return Math.round(line.quantity * line.unitAmount);
}

/** taxBps: basis points, e.g. 1800 = 18%. */
export function computeTotals(lines: LineLike[], taxBps: number) {
  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const tax = Math.round((subtotal * taxBps) / 10000);
  return { subtotal, tax, total: subtotal + tax };
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** Hours rounded to 2 decimals, used as invoice quantity. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** Parse "1.5" (hours) or "1:30" into minutes. NaN if invalid or outside 1 min – 24 h. */
export function parseDuration(input: string): number {
  const s = input.trim();
  let minutes: number;
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (hm) minutes = Number(hm[1]) * 60 + Number(hm[2]);
  else if (/^\d+(\.\d+)?$/.test(s)) minutes = Math.round(Number(s) * 60);
  else return NaN;
  return minutes >= 1 && minutes <= 24 * 60 ? minutes : NaN;
}
