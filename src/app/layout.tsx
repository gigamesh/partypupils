import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { CartProvider } from "@/components/CartProvider";
import { SocialLinks } from "@/components/SocialLinks";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceMono.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col">
        <div className="bg-animate" aria-hidden="true">
          <Image
            src="/images/data.jpeg"
            alt=""
            width={3840}
            height={1080}
            className="opacity-40"
            priority
          />
        </div>
        <CartProvider>
          <Navigation />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border py-8 bg-gradient-to-b from-transparent to-black">
            <div className="mx-auto max-w-5xl px-4 flex flex-col items-center">
              <SocialLinks iconSize={24} className="neon-glow" />
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
