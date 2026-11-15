/** Pure helpers for animated KPI numbers. Kept free of React so they are unit-testable. */
export interface Animatable { prefix: string; value: number; decimals: number; suffix: string; grouped: boolean }

// Only plain currency amounts, counts and percentages animate. Dates, ranges and text such as "15 Nov 2026" never match.
const PATTERN = /^([£$€]?)(−|-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%?)$/;

/** Splits an already formatted value ("£1,234.50", "87.5%", "42") into the number to animate and how to print it again. */
export function parseAnimatable(text: string): Animatable | null {
  const m = PATTERN.exec(text.trim());
  if (!m) return null;
  const [, prefix, sign, int, frac = "", suffix] = m;
  const n = Number(`${int.replace(/,/g, "")}${frac ? `.${frac}` : ""}`);
  return { prefix: prefix + (sign ? "−" : ""), value: sign ? -n : n, decimals: frac.length, suffix, grouped: int.includes(",") || n >= 1000 };
}

/** Prints a number in the same shape as the target, so the count-up never changes the layout's format. */
export function formatLike(n: number, shape: Pick<Animatable, "prefix" | "decimals" | "suffix">): string {
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-GB", { minimumFractionDigits: shape.decimals, maximumFractionDigits: shape.decimals });
  const negative = n < 0 && Number(abs.toFixed(shape.decimals)) !== 0;
  // The prefix may already carry the minus (target < 0); otherwise add one for a negative in-between value.
  const prefix = shape.prefix.includes("−") ? shape.prefix : negative ? `${shape.prefix}−` : shape.prefix;
  return `${prefix}${body}${shape.suffix}`;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
