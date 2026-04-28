"use client";

/** Three-bar equalizer used to mark the currently-playing track or release. Animates when active; static and dim when inactive. */
export function NowPlayingIndicator({ size = 14, active = true }: { size?: number; active?: boolean }) {
  return (
    <span
      aria-label={active ? "Now playing" : "Idle"}
      className="inline-flex items-end gap-[2px]"
      style={{ height: size, width: size }}
      data-active={active ? "true" : "false"}
    >
      <span className="np-bar" style={{ animationDelay: "0s" }} />
      <span className="np-bar" style={{ animationDelay: "0.15s" }} />
      <span className="np-bar" style={{ animationDelay: "0.3s" }} />
      <style>{`
        .np-bar {
          display: inline-block;
          width: 2px;
          height: 100%;
          background: var(--color-neon);
          border-radius: 1px;
          transform-origin: bottom;
        }
        [data-active="true"] > .np-bar {
          animation: npBarPulse 0.9s ease-in-out infinite alternate;
        }
        [data-active="false"] > .np-bar {
          transform: scaleY(0.3);
          opacity: 0.35;
        }
        @keyframes npBarPulse {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </span>
  );
}
