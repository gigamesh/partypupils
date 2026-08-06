"use client";

import Image from "@/components/Image";
import { usePathname } from "next/navigation";

/**
 * Tiling grain, generated inline via SVG fractal turbulence so it costs no
 * extra network request and stays crisp at any viewport size. The colour matrix
 * zeroes RGB and routes the noise into the alpha channel, so the speckles carry
 * their own varying transparency and composite normally without a blend mode.
 */
const GRAIN_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 -0.35'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23g)'/%3E%3C/svg%3E\")";

export function FixedBackground() {
  const pathname = usePathname();
  const imrovedContrast =
    pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <Image
        src="/images/beach-bg.webp"
        alt=""
        fill
        priority
        className={`object-cover object-[30%_50%] ${imrovedContrast ? "scale-110 blur-sm" : ""}`}
        sizes="100vw"
      />
      <div
        className="absolute inset-0"
        style={{ background: "rgba(31, 112, 178, 0.3)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRAIN_TILE,
          backgroundSize: "180px 180px",
          opacity: 0.55,
        }}
      />
      {imrovedContrast && (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0, 0, 0, 0.4)" }}
        />
      )}
    </div>
  );
}
