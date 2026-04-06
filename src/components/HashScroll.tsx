"use client";

import { useEffect } from "react";

export function HashScroll() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const scrollToHash = () => {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    // Delay to allow dynamic content to render and settle
    const timeout = setTimeout(scrollToHash, 1000);
    return () => clearTimeout(timeout);
  }, []);

  return null;
}
