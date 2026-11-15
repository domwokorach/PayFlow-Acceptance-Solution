import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The app root is this folder. A stray lockfile higher up the repo would otherwise be picked as the workspace root.
  turbopack: { root: path.resolve(__dirname) },
};
export default nextConfig;
