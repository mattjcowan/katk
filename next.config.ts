import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server at .next/standalone for a lean Docker image.
  output: "standalone",
  // better-sqlite3 is a native module — keep it out of the bundler. As an
  // external package it is copied whole into standalone (native binary included).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
