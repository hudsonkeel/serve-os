import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. Resumes (PDF/DOCX) can reach 3–5MB.
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/get-started",
        headers: [
          {
            key: "Content-Security-Policy",
            // Allow embedding only from the Serve public website and Netlify preview deployments.
            // 'self' covers os-servercaregiving.netlify.app itself.
            value:
              "frame-ancestors 'self' https://servecaregiving.com https://www.servecaregiving.com https://*.netlify.app",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
