import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { CartProvider } from "@/components/CartProvider";
import { SocialLinks } from "@/components/SocialLinks";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <CartProvider>
          <Navigation />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border py-8">
            <div className="mx-auto max-w-5xl px-4 flex flex-col items-center gap-4">
              <SocialLinks iconSize={18} />
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} Party Pupils. All rights
                reserved.
              </p>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
