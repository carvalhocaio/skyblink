import type { Metadata, Viewport } from "next";
import { Geist_Mono, Mona_Sans } from "next/font/google";
import "./globals.css";

// Mona Sans with its width axis: headings run slightly wide, which gives the page its own voice.
const mona = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  axes: ["wdth"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description = "Real NASA SPHEREx images of the sky, played season after season, so you can see with your own eyes which stars are on the move.";

// Share image: opengraph-image.png / twitter-image.png beside this file.
// On Vercel the share URLs resolve on their own; elsewhere set NEXT_PUBLIC_SITE_URL.
export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: "SkyBlink: watch stars move in NASA SPHEREx images",
  description,
  openGraph: { title: "SkyBlink: stars move. Here’s the proof.", description, siteName: "SkyBlink", type: "website" },
  twitter: { card: "summary_large_image", title: "SkyBlink: stars move. Here’s the proof.", description },
};

export const viewport: Viewport = { themeColor: "#05070d" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${mona.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
