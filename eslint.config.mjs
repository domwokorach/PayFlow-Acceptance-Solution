import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config. Next's core-web-vitals and TypeScript presets cover React hooks, accessibility basics and Next-specific rules.
const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Reading localStorage or media queries after mount (to avoid hydration mismatches) and driving requestAnimationFrame
      // animations legitimately set state in effects, so this stays a visible warning instead of failing the build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  { ignores: [".next/**", "node_modules/**", "coverage/**", "reports/**", "next-env.d.ts"] },
];
export default config;
