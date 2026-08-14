import type { MetadataRoute } from "next";

// Web app manifest — Next.js App Router convention (auto-served at
// /manifest.webmanifest, auto-linked into <head>, no manual <link
// rel="manifest"> tag needed). Home Screen installability only: no service
// worker, no offline caching, no background sync — none of that is
// registered anywhere in this app, and this file doesn't imply any.
//
// start_url is "/residents" (The People We Serve) — deliberately NOT "/",
// which still redirects to Today's Work for every normal browser visit,
// unchanged. This is the one, minimal, intentional divergence between a
// Home Screen/standalone launch and a regular browser visit: real-device
// testing showed People We Serve should be the mobile operational home,
// and start_url is exactly the mechanism the web-app-manifest spec
// provides for "launched from the icon" vs. "opened in a browser tab" —
// no user-agent sniffing, no runtime device/context branching, no change
// to app/page.tsx's own redirect at all. Desktop browsing is completely
// unaffected since it never goes through start_url.
//
// Icon source: public/serve-heart-icon.png (cream rounded-square / navy
// circle / gold heart) — see public/icons/icon-192.png and icon-512.png,
// derived from it via transparent-padding + resize only, no redraw.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Serve Caregiving",
    short_name: "Serve",
    description: "The operating system for Serve Caregiving",
    start_url: "/residents",
    display: "standalone",
    background_color: "#2F3F57",
    theme_color: "#2F3F57",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
