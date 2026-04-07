"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

const BG_OPTIONS = [
  { label: "Current", src: "/images/ocean-bg.jpg" },
  { label: "Option 1", src: "/images/bg-options/photo-1528241441550-c415af94bb3d.jpg" },
  { label: "Option 3", src: "/images/bg-options/photo-1659050598293-13df2a4276ef.jpg" },
  { label: "Option 4", src: "/images/bg-options/photo-1760358928749-dd66be9aecac.jpg" },
];

/** Temporary dev tool for previewing background image options. */
export function BgSwitcher() {
  const [activeBg, setActiveBg] = useState(BG_OPTIONS[0].src);
  const [open, setOpen] = useState(false);
  const [focalPoint, setFocalPoint] = useState({ x: 50, y: 50 });
  const [opacity, setOpacity] = useState(40);
  const dragging = useRef(false);
  const focalRef = useRef<HTMLDivElement>(null);

  const updateFocalFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = focalRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)));
    setFocalPoint({ x, y });
  }, []);

  const onPointerDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    updateFocalFromEvent(e);

    const onMove = (ev: MouseEvent) => {
      if (dragging.current) updateFocalFromEvent(ev);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [updateFocalFromEvent]);

  return (
    <>
      <div className="bg-static" aria-hidden="true">
        <Image
          src={activeBg}
          alt=""
          fill
          className="object-cover"
          style={{ objectPosition: `${focalPoint.x}% ${focalPoint.y}%`, opacity: opacity / 100 }}
          priority
          sizes="100vw"
          unoptimized
        />
      </div>

      <div className="fixed top-16 right-4 z-[100]">
        <button
          onClick={() => setOpen(!open)}
          className="bg-black/80 text-white text-xs px-3 py-1.5 rounded border border-white/20 hover:border-white/40 transition-colors"
        >
          {open ? "Close" : "BG"}
        </button>

        {open && (
          <div className="mt-2 bg-black/90 border border-white/20 rounded-lg p-3 w-48 space-y-3">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wide">Background</p>
            {BG_OPTIONS.map((opt) => (
              <button
                key={opt.src}
                onClick={() => setActiveBg(opt.src)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  activeBg === opt.src
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="w-10 h-6 rounded overflow-hidden flex-shrink-0 border border-white/10">
                  <img src={opt.src} alt="" className="w-full h-full object-cover" />
                </div>
                {opt.label}
              </button>
            ))}

            <div className="border-t border-white/10 pt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/60 text-xs font-medium uppercase tracking-wide">
                  Opacity
                  <span className="ml-1 normal-case text-white/40">{opacity}%</span>
                </p>
                <button
                  onClick={() => setOpacity(40)}
                  className="text-white/40 hover:text-white/70 text-[10px] transition-colors"
                >
                  Reset
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full h-1 accent-white appearance-none bg-white/20 rounded-full cursor-pointer"
              />
            </div>

            <div className="border-t border-white/10 pt-3">
              <p className="text-white/60 text-xs font-medium uppercase tracking-wide mb-2">
                Focal Point
                <span className="ml-1 normal-case text-white/40">
                  {focalPoint.x}% {focalPoint.y}%
                </span>
              </p>
              <div
                ref={focalRef}
                onMouseDown={onPointerDown}
                className="relative w-full aspect-[3/2] rounded overflow-hidden border border-white/10 cursor-crosshair select-none"
              >
                <img
                  src={activeBg}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                />
                <div
                  className="absolute w-4 h-4 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_4px_rgba(0,0,0,0.8)]"
                  style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `
                      linear-gradient(to right, transparent calc(${focalPoint.x}% - 0.5px), rgba(255,255,255,0.3) calc(${focalPoint.x}% - 0.5px), rgba(255,255,255,0.3) calc(${focalPoint.x}% + 0.5px), transparent calc(${focalPoint.x}% + 0.5px)),
                      linear-gradient(to bottom, transparent calc(${focalPoint.y}% - 0.5px), rgba(255,255,255,0.3) calc(${focalPoint.y}% - 0.5px), rgba(255,255,255,0.3) calc(${focalPoint.y}% + 0.5px), transparent calc(${focalPoint.y}% + 0.5px))
                    `,
                  }}
                />
              </div>
              <button
                onClick={() => setFocalPoint({ x: 50, y: 50 })}
                className="mt-1.5 text-white/40 hover:text-white/70 text-[10px] transition-colors"
              >
                Reset to center
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
