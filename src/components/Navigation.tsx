"use client";

import Link from "next/link";
import { useState } from "react";
import { CartButton } from "./CartButton";
import { MERCH_URL } from "@/lib/constants";

const NAV_ITEMS: readonly { label: string; href: string; external?: boolean; mobileOnly?: boolean }[] = [
  { label: "Music", href: "/music" },
  { label: "Tour", href: "/#tour" },
  { label: "Merch", href: MERCH_URL, external: true },
  { label: "My Orders", href: "/orders/lookup" },
  { label: "Cart", href: "/cart", mobileOnly: true },
];

function NavLink({ item, onClick }: { item: (typeof NAV_ITEMS)[number]; onClick?: () => void }) {
  const className = "neon-link text-sm font-medium uppercase tracking-wider";
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {item.label}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onClick}>
      {item.label}
    </Link>
  );
}

export function Navigation() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-black/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-neon">
            Party Pupils
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.filter((item) => !item.mobileOnly).map((item) => (
              <NavLink key={item.label} item={item} />
            ))}
            <CartButton />
          </div>

          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            className="neon-link md:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
        </nav>
      </header>

      <div
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-300 md:hidden ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        className={`fixed top-0 right-0 z-50 h-full w-64 bg-black border-l border-border transition-transform duration-300 ease-in-out md:hidden ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex justify-end p-4">
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="neon-link"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18" />
              <line x1="6" x2="18" y1="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-6 px-6 py-4 [&_a]:text-lg">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.label} item={item} onClick={() => setOpen(false)} />
          ))}
        </div>
      </div>
    </>
  );
}
