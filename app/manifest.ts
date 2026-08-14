import type { MetadataRoute } from "next";

// Web app manifest — Next.js App Router convention (auto-served at
// /manifest.webmanifest, auto-linked into <head>, no manual <link
// rel="manifest"> tag needed). Home Screen installability only: no service
// worker, no offline caching, no background sync — none of that is
// registered anywhere in this app, and this file doesn't imply any.
//
// start_url is "/" rather than a hardcoded route — "/" already redirects an
// authenticated session to Today's Work (see components/Sidebar.tsx's
// comment on the Post-Release Stabilization decision), so a Home Screen
// launch lands exactly where a normal browser visit would, without
// duplicating that redirect logic here.
//
// Icon source: TEMPORARY PLACEHOLDER (public/COLORED BG_edited.jpg, the
// existing navy-square wordmark asset) — pending the actual supplied
// heart-mark image (cream rounded-square / navy circle / gold heart, no
// text) being saved to a readable file path. Swap public/icons/icon-*.png
// for the real asset once available; nothing else in this file needs to
// change.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Serve Caregiving",
    short_name: "Serve",
    description: "The operating system for Serve Caregiving",
    start_url: "/",
    display: "standalone",
    background_color: "#2F3F57",
    theme_color: "#2F3F57",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
