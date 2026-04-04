import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/cmt",
        destination: "https://nativ-cmt.s0nderlabs.xyz/",
      },
      {
        source: "/cmt/:path*",
        destination: "https://nativ-cmt.s0nderlabs.xyz/:path*",
      },
    ];
  },
};

export default nextConfig;
