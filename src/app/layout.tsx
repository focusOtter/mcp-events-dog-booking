import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("https://mcp-events-dog-booking.vercel.app"),
  title: "Otter Paws — good-dog grooming club",
  description: "Gentle grooming, happy pups, and real-time MCP Events.",
  openGraph: {
    type: "website",
    url: "/",
    title: "Otter Paws — good-dog grooming club",
    description: "Book a groom. Send a signed MCP Event. A two-site SEP-3415 demo.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Otter Paws booking — fresh trims, real-time tail wags" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Otter Paws — good-dog grooming club",
    description: "Book a groom. Send a signed MCP Event.",
    images: [{ url: "/og.png", alt: "Otter Paws booking — fresh trims, real-time tail wags" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
