"use client";

import Image from "@/components/Image";
import { usePathname } from "next/navigation";

export function FixedBackground() {
  const pathname = usePathname();
  const imrovedContrast =
    pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <Image
        src="/images/ocean-bg.webp"
        alt=""
        fill
        className={`object-cover object-[50%_15%] ${imrovedContrast ? "scale-110 blur-sm" : ""}`}
        sizes="100vw"
      />
      <div
        className="absolute inset-0"
        style={{ background: "rgba(31, 112, 178, 0.3)" }}
      />
      {imrovedContrast && (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0, 0, 0, 0.5)" }}
        />
      )}
    </div>
  );
}
