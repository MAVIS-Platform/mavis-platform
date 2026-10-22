import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env["MAVIS_NEXT_DIST_DIR"] ?? ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
