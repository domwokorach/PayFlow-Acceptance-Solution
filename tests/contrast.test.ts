import { describe, expect, it } from "vitest";
import { theme, tokens } from "../lib/theme";

// WCAG 2.x relative luminance and contrast ratio.
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
function lum(hex: string) { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

type Scheme = "light" | "dark";
const schemes = (theme as unknown as { colorSchemes: Record<Scheme, { palette: Record<string, Record<string, string>> }> }).colorSchemes;
const palette = (m: Scheme) => schemes[m].palette;
const TYPES = ["success", "error", "warning", "info"] as const;

describe.each(["light", "dark"] as const)("notification colours meet WCAG AA in %s mode", (mode) => {
  const p = palette(mode);
  const surface = p.background.paper;
  it("title and description text on the toast surface (4.5:1)", () => {
    expect(ratio(p.text.primary, surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.text.secondary, surface)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(TYPES)("%s icon colour on the toast surface (3:1 for graphics, 4.5:1 as used for text)", (type) => {
    expect(ratio(p[type].text, surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("the unread highlight in the centre keeps text readable", () => {
    // action.hover is a translucent overlay; check against the worst case, the surface darkened or lightened by 8%.
    const overlay = mode === "light" ? "#EBEBEB" : "#242B3A";
    expect(ratio(p.text.primary, overlay)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.text.secondary, overlay)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("design tokens", () => {
  it("the light semantic text colours are the AA variants", () => {
    for (const c of [tokens.successText, tokens.errorText, tokens.warningText, tokens.accentText]) expect(ratio(c, tokens.panel)).toBeGreaterThanOrEqual(4.5);
  });
});
