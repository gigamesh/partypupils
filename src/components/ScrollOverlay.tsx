"use client";

import { useEffect, useRef } from "react";

interface ScrollOverlayProps {
  maxOpacity?: number;
  scrollDistance?: number;
}

export function ScrollOverlay({
  maxOpacity = 0.5,
  scrollDistance = 0.85,
}: ScrollOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (ref.current) {
          const distance = window.innerHeight * scrollDistance;
          const progress = Math.min(window.scrollY / distance, 1);
          ref.current.style.opacity = String(progress * maxOpacity);
        }
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [maxOpacity, scrollDistance]);

  return (
    <div
      ref={ref}
      className="fixed inset-0 -z-1 bg-background pointer-events-none"
      style={{ opacity: 0 }}
      aria-hidden="true"
    />
  );
}
