import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. Recruiting resumes (PDF/DOCX) cap at 5MB
      // (lib/actions/recruiting.ts's own MAX_RESUME_BYTES, unaffected by
      // this — it's a separate, lower app-level check). Client Readiness
      // document evidence (lib/workforce/storage.ts's MAX_DOCUMENT_BYTES)
      // was later designed for PDFs up to 10MB, but this limit was never
      // raised to match — every upload between 5MB and 10MB (and the
      // live-reported 14.3MB case) was silently rejected by this
      // infrastructure ceiling before ever reaching that 10MB
      // application-level validation, producing an opaque failure
      // instead of the honest "File size must be under 10 MB" message
      // validateDocumentFile() already returns. 11mb gives the 10MB PDF
      // limit headroom for multipart/form-data overhead beyond the raw
      // file bytes.
      bodySizeLimit: "11mb",
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
