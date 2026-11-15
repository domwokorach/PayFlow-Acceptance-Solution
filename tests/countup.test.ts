import { describe, expect, it } from "vitest";
import { easeOutCubic, formatLike, lerp, parseAnimatable } from "../lib/countup";

describe("parseAnimatable", () => {
  it("reads currency, counts and percentages", () => {
    expect(parseAnimatable("£12,345.67")).toMatchObject({ prefix: "£", value: 12345.67, decimals: 2, suffix: "" });
    expect(parseAnimatable("42")).toMatchObject({ prefix: "", value: 42, decimals: 0 });
    expect(parseAnimatable("87.5%")).toMatchObject({ value: 87.5, decimals: 1, suffix: "%" });
    expect(parseAnimatable("£0.00")).toMatchObject({ value: 0, decimals: 2 });
  });
  it("handles negatives written with either minus sign", () => {
    expect(parseAnimatable("−£5.00")).toBeNull(); // sign before the symbol is not a shape we print
    expect(parseAnimatable("£−5.00")).toMatchObject({ value: -5, prefix: "£−" });
    expect(parseAnimatable("-3")).toMatchObject({ value: -3 });
  });
  it("never animates dates, placeholders or text", () => {
    for (const t of ["—", "", "15 Nov 2026, 12:00", "None yet", "3 of 5", "12:30", "1.2.3", "Net £5.00"]) expect(parseAnimatable(t), t).toBeNull();
  });
});

describe("formatLike", () => {
  const shape = { prefix: "£", decimals: 2, suffix: "" };
  it("keeps the target's currency format at every step", () => {
    expect(formatLike(0, shape)).toBe("£0.00");
    expect(formatLike(1234.5, shape)).toBe("£1,234.50");
    expect(formatLike(1234567.891, shape)).toBe("£1,234,567.89");
  });
  it("keeps counts whole and percentages suffixed", () => {
    expect(formatLike(41.6, { prefix: "", decimals: 0, suffix: "" })).toBe("42");
    expect(formatLike(87.46, { prefix: "", decimals: 1, suffix: "%" })).toBe("87.5%");
  });
  it("prints a negative in-between value with a proper minus", () => {
    expect(formatLike(-5, shape)).toBe("£−5.00");
    expect(formatLike(-0.001, shape)).toBe("£0.00");
  });
  it("round-trips the formatted target exactly", () => {
    for (const t of ["£12,345.67", "42", "87.5%", "£0.00", "1,204"]) { const a = parseAnimatable(t)!; expect(formatLike(a.value, a), t).toBe(t); }
  });
});

describe("easing", () => {
  it("starts at 0, ends at 1 and decelerates", () => {
    expect(easeOutCubic(0)).toBe(0); expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(2)).toBe(1); expect(easeOutCubic(-1)).toBe(0);
  });
  it("interpolates", () => { expect(lerp(10, 20, 0.5)).toBe(15); });
});
