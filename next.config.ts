import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
