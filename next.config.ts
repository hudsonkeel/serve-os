import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. Resumes (PDF/DOCX) can reach 3–5MB.
      bodySizeLimit: "5mb",
    },
  },
  // Governance's Background Eligibility classifier reads the real
  // governance YAML files at runtime (fs.readFileSync) instead of
  // hand-transcribing them into TypeScript — see
  // docs/architecture/decisions/0002-governance-decision-vertical-slice.md.
  // Next's Output File Tracing only bundles files it can statically detect
  // via import/require/fs analysis, and this app deploys to Netlify via
  // @netlify/plugin-nextjs (built on that same tracing) — a dynamic fs read
  // like this one is exactly the case outputFileTracingIncludes exists for.
  // A global "/*" key is fine here: this is a handful of small YAML files,
  // not the large/repo-root glob the docs caution against.
  outputFileTracingIncludes: {
    "/*": ["docs/governance/workforce/background-eligibility/*.yml"],
  },
  async headers() {
    return [
      {
        source: "/get-started",
        headers: [
          {
            key: "Content-Security-Policy",
            // Allow embedding only from the Serve public website and Netlify preview deployments.
            // 'self' covers os-servecaregiving.netlify.app itself.
            value:
              "frame-ancestors 'self' https://servecaregiving.com https://www.servecaregiving.com https://*.netlify.app",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
