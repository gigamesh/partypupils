import { AudioProvider } from "@/components/AudioProvider";
import { CartProvider } from "@/components/CartProvider";
import { PageShell } from "@/components/PageShell";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { env } from "@/lib/env";
import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import Image from "@/components/Image";
import "./globals.css";

const baseUrl = env.NEXT_PUBLIC_BASE_URL();

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-heading-var",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-var",
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
        url: "/images/og-image.png",
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
    images: ["/images/og-image.png"],
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
      className={`${outfit.variable} ${inter.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <div className="bg-static" aria-hidden="true">
          <Image
            src="/images/ocean-bg.jpg"
            alt=""
            fill
            className="object-cover"
            style={{ objectPosition: "50% 15%" }}
            priority
            sizes="100vw"
          />
        </div>
        <CartProvider>
          <AudioProvider>
            <div className="relative z-[2] flex flex-col flex-1">
              <PageShell>{children}</PageShell>
            </div>
          </AudioProvider>
        </CartProvider>
      </body>
    </html>
  );
}
