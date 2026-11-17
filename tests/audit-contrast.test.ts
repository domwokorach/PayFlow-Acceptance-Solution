import { describe, expect, it } from "vitest";
import { tokens } from "../lib/theme";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** Blend `fg` at `alpha` over `bg`. */
const over = (fg: string, bg: string, alpha: number) => `#${[1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;

describe("colour contrast (WCAG 2.2 AA)", () => {
  it("keeps primary usable as text on white", () => expect(ratio(tokens.accent, tokens.panel)).toBeGreaterThanOrEqual(4.5));
  it("keeps chart marks at 3:1 against the panel", () => {
    for (const c of [tokens.accent, tokens.successText, tokens.warningText, tokens.down]) expect(ratio(c, tokens.panel)).toBeGreaterThanOrEqual(3);
    expect(ratio(over(tokens.accent, tokens.panel, 0.7), tokens.panel)).toBeGreaterThanOrEqual(3);
  });
  it("keeps error chip text at 4.5:1 on its 12% tint", () => expect(ratio(tokens.errorText, over(tokens.down, tokens.panel, 0.12))).toBeGreaterThanOrEqual(4.5));
  it("keeps white button labels at 4.5:1 on filled primary", () => {
    expect(ratio("#FFFFFF", tokens.accentText)).toBeGreaterThanOrEqual(4.5); // light scheme: primary.dark
    expect(ratio("#FFFFFF", "#2563EB")).toBeGreaterThanOrEqual(4.5); // dark scheme: primary.dark
  });
});
