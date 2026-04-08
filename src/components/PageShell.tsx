"use client";

import { usePathname } from "next/navigation";
import { Navigation } from "./Navigation";
import { SocialLinks } from "./SocialLinks";

const STANDALONE_ROUTES = ["/links"];

export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = STANDALONE_ROUTES.includes(pathname);

  if (isStandalone) {
    return <main className="flex-1 bg-darkened">{children}</main>;
  }

  return (
    <>
      <Navigation />
      <main className="flex-1 bg-darkened">{children}</main>
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-5xl px-4 flex flex-col items-center">
          <SocialLinks iconSize={24} className="neon-glow" />
        </div>
      </footer>
    </>
  );
}
