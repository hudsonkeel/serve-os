import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. Resumes (PDF/DOCX) can reach 3–5MB.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
