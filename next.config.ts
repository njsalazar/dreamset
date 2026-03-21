import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
