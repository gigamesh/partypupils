"use client";

import { useEffect, useRef } from "react";
import { SEATED_ARTIST_ID } from "@/lib/constants";

export function SeatedTourWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://widget.seated.com/app-v2.css";
    document.head.appendChild(link);

    const widgetDiv = document.createElement("div");
    widgetDiv.id = `seated-${SEATED_ARTIST_ID}`;
    widgetDiv.setAttribute("data-artist-id", SEATED_ARTIST_ID);
    widgetDiv.setAttribute("data-css-version", "2");
    widgetDiv.setAttribute("data-start-load", "true");
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://widget.seated.com/app.js";
    container.appendChild(script);

    return () => {
      link.remove();
      container.innerHTML = "";
    };
  }, []);

  return <div ref={containerRef} />;
}
