import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // lets parallel dev servers / CI use separate build dirs
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
};

export default nextConfig;
