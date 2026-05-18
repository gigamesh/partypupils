"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Releases", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/links", label: "Links" },
  { href: "/admin/link-pages", label: "Link Pages" },
  { href: "/admin/faq", label: "FAQ" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="h-scroll flex items-center gap-4 border-b border-border pb-4 mb-6 -mx-4 px-4">
      {LINKS.map(({ href, label, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? "text-sm font-semibold hover:underline whitespace-nowrap shrink-0"
                : "text-sm text-muted-foreground hover:underline whitespace-nowrap shrink-0"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
