import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env["MAVIS_DOCKER_STANDALONE"] === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["elkjs"],
  outputFileTracingIncludes: {
    "/api/mavis/*": ["./node_modules/elkjs/lib/elk.bundled.js"],
    "/api/diagram-engine/*": [
      "./node_modules/@plantuml/core/*.js",
      "./node_modules/elkjs/lib/elk-worker.min.js",
    ],
  },
  distDir: process.env["MAVIS_NEXT_DIST_DIR"] ?? ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
