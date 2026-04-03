"use client";

import Link from "next/link";
import { CartButton } from "./CartButton";
import { MERCH_URL } from "@/lib/constants";

export function Navigation() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Party Pupils
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/store"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Store
          </Link>
          <Link
            href="/#tour"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Tour
          </Link>
          <a
            href={MERCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Merch
          </a>
          <CartButton />
        </div>
      </nav>
    </header>
  );
}
