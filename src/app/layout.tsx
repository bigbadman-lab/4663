import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "4663",
  description: "Live intelligence canvas for Robinhood Chain",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-neutral-900">
        <PresenceHeartbeat />
        {children}
      </body>
    </html>
  );
}
