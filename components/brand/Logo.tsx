import { cn } from "@/lib/cn";

/**
 * SilverStone Studio brand mark — a faceted silver "stone" whose cut edges
 * read as a rising waveform / play peak. Pure inline SVG with a silver
 * gradient so it sits cleanly on dark studio surfaces. Currency of the brand:
 * one mark, used at any size.
 */
export function LogoMark({ className, title = "SilverStone Studio" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ss-silver" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4f6f8" />
          <stop offset="0.5" stopColor="#c2cad3" />
          <stop offset="1" stopColor="#8b95a1" />
        </linearGradient>
        <linearGradient id="ss-facet" x1="16" y1="4" x2="16" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#aab3bd" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* faceted stone / rising peak */}
      <path d="M16 3 L28 24 L20 24 L16 15 L12 24 L4 24 Z" fill="url(#ss-silver)" />
      {/* inner facet highlight */}
      <path d="M16 3 L20 24 L16 15 L12 24 Z" fill="url(#ss-facet)" opacity="0.55" />
      {/* base line — the "stone" seated on the floor */}
      <rect x="6" y="26.5" width="20" height="2.2" rx="1.1" fill="url(#ss-silver)" opacity="0.85" />
    </svg>
  );
}

/** Full lockup: mark + wordmark. */
export function Logo({
  className,
  showSub = true,
}: {
  className?: string;
  showSub?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8" />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-[var(--color-ink)]">
          SilverStone <span className="text-[var(--color-ink-muted)]">Studio</span>
        </div>
        {showSub && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Music Studio
          </div>
        )}
      </div>
    </div>
  );
}
