"use client";

/** Animated three-bar equalizer used to mark the currently-playing track or release. */
export function NowPlayingIndicator({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-label="Now playing"
      className="inline-flex items-end gap-[2px]"
      style={{ height: size, width: size }}
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
          animation: npBarPulse 0.9s ease-in-out infinite alternate;
          transform-origin: bottom;
        }
        @keyframes npBarPulse {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </span>
  );
}
