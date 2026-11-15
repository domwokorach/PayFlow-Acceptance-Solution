import { defineConfig } from "vitest/config";
// Pure logic runs in node. Component tests opt in to jsdom with a `// @vitest-environment jsdom` docblock.
export default defineConfig({ test: { include: ["tests/**/*.test.{ts,tsx}"], environment: "node" } });
