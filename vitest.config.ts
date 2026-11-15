import { defineConfig } from "vitest/config";
// Pure logic runs in node. Component tests opt in to jsdom with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/**", "hooks/**", "components/**"],
      exclude: ["**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage",
    },
  },
});
