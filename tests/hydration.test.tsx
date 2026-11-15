// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material/styles";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetricCard } from "../components/ui/MetricCard";
import { StatusChip } from "../components/ui/StatusChip";
import { theme } from "../lib/theme";

afterEach(() => vi.restoreAllMocks());

/** Server-render, then hydrate the same tree and assert React reports no mismatch (the usual cause of Next.js hydration errors). */
describe("hydration", () => {
  it("MetricCard (animated value) and StatusChip hydrate without mismatches or console errors", async () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tree = () => (
      <ThemeProvider theme={theme}>
        <MetricCard label="Captured volume" value="£16,569.00" hint="Net £10,611.50" />
        <StatusChip status="CAPTURED" />
      </ThemeProvider>
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(tree());
    const recoverable = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, tree(), { onRecoverableError: recoverable }); });
    expect(recoverable).not.toHaveBeenCalled();
    const hydrationErrors = errors.mock.calls.filter((c) => /hydrat|did not match|mismatch/i.test(String(c[0])));
    expect(hydrationErrors).toEqual([]);
    expect(container.textContent).toContain("£16,569.00");
    await act(async () => { root.unmount(); }); // cancels the count-up frame so nothing outlives the test
  });
});
