import { AudioProvider } from "@/components/AudioProvider";
import { CartProvider } from "@/components/CartProvider";
import { FixedBackground } from "@/components/FixedBackground";
import { PageShell } from "@/components/PageShell";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { env } from "@/lib/env";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const baseUrl = env.NEXT_PUBLIC_BASE_URL();

const urbancat = localFont({
  src: [
    { path: "./fonts/urbancat-light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/urbancat-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/urbancat-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-urbancat",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/images/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${urbancat.variable} antialiased dark`}
    >
      <body>
        <FixedBackground />
        <div className="relative z-10 flex flex-col min-h-dvh">
          <CartProvider>
            <AudioProvider>
              <PageShell>{children}</PageShell>
            </AudioProvider>
          </CartProvider>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
