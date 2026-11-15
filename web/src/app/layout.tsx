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

// Absolute base for share images, canonical and hreflang links (search engines need full URLs). On Vercel it is
// the production domain, also on previews, so a preview never claims to be the canonical page.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

// Share image: opengraph-image.png / twitter-image.png beside this file.
// On Vercel the share URLs resolve on their own; elsewhere set NEXT_PUBLIC_SITE_URL.
export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: "SkyBlink: watch stars move in NASA SPHEREx images",
  description,
  // The same page in two languages: search engines link each version to the other.
  alternates: { canonical: "/", languages: { en: "/", "pt-BR": "/?lang=pt", "x-default": "/" } },
  openGraph: { title: "SkyBlink: stars move. Here’s the proof.", description, siteName: "SkyBlink", type: "website", locale: "en_US", alternateLocale: ["pt_BR"] },
  twitter: { card: "summary_large_image", title: "SkyBlink: stars move. Here’s the proof.", description },
};

export const viewport: Viewport = { themeColor: "#05070d", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${mona.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* The page shell is static, so ?lang=pt is applied before first paint: browsers, screen readers and
            Chrome's translate prompt then see Portuguese. home.tsx keeps it in sync on language switches. */}
        <script dangerouslySetInnerHTML={{ __html: `if(new URLSearchParams(location.search).get("lang")==="pt")document.documentElement.lang="pt-BR"` }} />
      </head>
      <body className="min-h-full flex flex-col overflow-x-clip bg-background text-foreground">{children}</body>
    </html>
  );
}
