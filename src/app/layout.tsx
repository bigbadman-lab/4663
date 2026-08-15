import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { CANVAS_TONE_BOOT_SCRIPT } from "@/lib/canvas/canvas-tone";
import "./globals.css";
/** playhtml@2.14.1 — same-origin CSS so SNAPSHOT can read cssRules. */
import "playhtml/dist/style.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://4663.live";
const SITE_NAME = "4663";
const SITE_TITLE = "4663 - a canvas for the internet";
const SITE_DESCRIPTION = "A canvas for the internet";
const OG_IMAGE_PATH = "/4663meta.jpg";
const FAVICON_PATH = "/4663fav.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s — 4663",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: FAVICON_PATH, type: "image/png" }],
    shortcut: FAVICON_PATH,
    apple: FAVICON_PATH,
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-canvas-tone="white"
      suppressHydrationWarning
    >
      <body className="min-h-full text-neutral-900">
        <Script
          id="4663-canvas-tone-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: CANVAS_TONE_BOOT_SCRIPT }}
        />
        <Script
          data-website-id="dfid_zSuZZbFaQ0cyXzZIIqLDQ"
          data-domain="4663.live"
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
        />
        <PresenceHeartbeat />
        {children}
      </body>
    </html>
  );
}
