import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kzgrpjijmsslmevpgtsk.supabase.co",
        pathname: "/storage/v1/object/public/project-media/**"
      },
      {
        protocol: "https",
        hostname: "kzgrpjijmsslmevpgtsk.supabase.co",
        pathname: "/storage/v1/object/public/catalog-assets/**"
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/v0/b/project-gussy.appspot.com/o/**"
      }
    ]
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
