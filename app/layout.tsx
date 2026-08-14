import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { AskServeProvider } from "@/components/askServe/AskServeProvider";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Serve OS",
  description: "The operating system for Serve Caregiving",
  // appleWebApp generates the apple-mobile-web-app-* meta tags via Next's
  // current metadata API (not hand-written legacy <meta> tags). "Serve" as
  // the Home Screen label — the manifest's short_name matches for parity
  // on browsers that read the manifest instead. No serviceWorker/offline
  // config exists anywhere in this app; this only affects how the page
  // presents itself when launched from a Home Screen icon.
  appleWebApp: {
    capable: true,
    title: "Serve",
    // "black" (opaque dark status bar) rather than "black-translucent" —
    // translucent lets page content draw underneath the status bar/notch,
    // which requires safe-area-inset padding this shell doesn't add yet.
    // "black" avoids that without looking wrong against the navy header.
    statusBarStyle: "black",
  },
  // app/manifest.ts is auto-detected and auto-linked by Next.js — no
  // manual `manifest:` field needed here.
};

// No viewport meta tag existed anywhere in this app before — Next.js App
// Router does not inject one by default. Without it, mobile Safari lays the
// page out against its default ~980px desktop-width virtual viewport and
// scales the whole thing down to fit the screen, which is the root cause of
// the "sidebar eats the screen, content is cropped off to the right, only
// zooming out reveals it" behavior on a real iPhone. maximum-scale/
// user-scalable are deliberately left at their defaults (pinch-zoom stays
// available) — this fixes the *initial* layout width, it doesn't lock the
// user out of zooming further if they want to.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2F3F57",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${dmSans.variable} h-full`}
    >
      <body className="h-full">
        <AskServeProvider>{children}</AskServeProvider>
      </body>
    </html>
  );
}
