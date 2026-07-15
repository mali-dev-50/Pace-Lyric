"use client";

import { cn } from "@/lib/cn";

/**
 * SilverStone Studio brand mark — a faceted isometric "S" stone. Its three
 * brand-blue tones (light top facet, mid-blue left face, deep-blue right face)
 * give the mark built-in dimension, so it needs no gradients. Pure inline SVG
 * with flat fills; one mark, used at any size.
 */
export function LogoMark({ className, title = "SilverStone Studio" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 1080 1080"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* top facet (lightest) */}
      <path
        d="M955.944 282.471L851.708 343.977L581.731 186.005L529.937 217.729L799.266 375.054L539.001 523.962L278.088 372.464L383.618 314.843L554.539 413.252L604.391 381.528L335.061 224.85L594.679 74L955.944 282.471Z"
        fill="#5EB0EF"
        stroke="#5EB0EF"
        strokeWidth="1.29485"
      />
      {/* right face (deepest) */}
      <path
        d="M539.001 523.314L800.561 373.759L799.267 495.475L632.23 591.942V650.21L901.56 495.475V796.528L539.001 1005V885.226L810.273 729.844V669.633L539.001 825.015V523.314Z"
        fill="#006ADC"
      />
      {/* left face (mid) */}
      <path
        d="M276.793 371.169L539.001 523.314V824.368L435.412 764.805V567.987L382.323 536.263V849.617L124 698.767V283.766L225.646 344.624V656.037L276.793 686.466V371.169Z"
        fill="#0081F1"
      />
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
