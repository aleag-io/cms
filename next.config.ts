import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/api-docs",
        destination: "/api-docs/index.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
