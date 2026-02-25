import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "app.riasistemas.com.br",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "automation-db.riasistemas.com.br",
        pathname: "/**",
      },
    ],
  },
  /* config options here */
};

export default nextConfig;
