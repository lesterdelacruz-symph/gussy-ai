import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kzgrpjijmsslmevpgtsk.supabase.co",
        pathname: "/storage/v1/object/public/project-media/**"
      }
    ]
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
