import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "app.riasistemas.com.br",
        pathname: "/**",
      },
    ],
  },
  /* config options here */
};

export default nextConfig;
