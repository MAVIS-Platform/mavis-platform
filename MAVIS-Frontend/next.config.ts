import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: { "/api/diagram-engine/*": ["./node_modules/@plantuml/core/*.js"] },
  distDir: process.env["MAVIS_NEXT_DIST_DIR"] ?? ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
