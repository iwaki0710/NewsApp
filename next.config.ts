import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The in-app browser reaches the local preview through 127.0.0.1.
  // Keep this development-only origin explicit so Next.js can hydrate the UI.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
