"use client";

import { usePathname } from "next/navigation";
import { Navigation } from "./Navigation";
import { SocialLinks } from "./SocialLinks";

const STANDALONE_ROUTES = ["/links"];

export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = STANDALONE_ROUTES.includes(pathname);

  if (isStandalone) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <Navigation />
      <main className="flex-1">{children}</main>
      <footer className="relative z-10 border-t border-white/10 py-8">
        <div className="mx-auto max-w-5xl px-4 flex flex-col items-center gap-4 sm:flex-row">
          <div className="hidden sm:block flex-1" />
          <SocialLinks iconSize={24} className="neon-glow" />
          <div className="sm:flex-1 sm:text-right">
            <span className="text-xs font-bold">
              Built by{" "}
              <a
                href="https://gigameshmusic.com/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="neon-link underline"
              >
                Gigamesh
              </a>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
