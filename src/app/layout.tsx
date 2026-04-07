import { AudioProvider } from "@/components/AudioProvider";
import { BgSwitcher } from "@/components/BgSwitcher";
import { CartProvider } from "@/components/CartProvider";
import { Navigation } from "@/components/Navigation";

import { SocialLinks } from "@/components/SocialLinks";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-heading-var",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-var",
});

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/favicon.png",
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
        <BgSwitcher />
        <CartProvider>
          <AudioProvider>
            <Navigation />
            <main className="flex-1 bg-darkened">{children}</main>
            <footer className="border-t border-white/10 py-8">
              <div className="mx-auto max-w-5xl px-4 flex flex-col items-center">
                <SocialLinks iconSize={24} className="neon-glow" />
              </div>
            </footer>
          </AudioProvider>
        </CartProvider>
      </body>
    </html>
  );
}
