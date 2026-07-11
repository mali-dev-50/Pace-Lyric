"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Coords {
  top: number;
  left?: number;
  right?: number;
}

/**
 * Dropdown menu rendered in a portal on document.body with fixed positioning,
 * so it always paints above the app regardless of the stacking contexts its
 * trigger sits inside (backdrop-blur headers, transformed cards, etc.).
 */
export function Menu({
  trigger,
  items,
  align = "right",
}: {
  trigger: React.ReactNode;
  items: (MenuItem | "divider")[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords>({ top: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 8;
    const panelH = panelRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    // Flip above the trigger when it would otherwise be clipped at the bottom
    // (e.g. a menu opened from the bottom console) and there's more room above.
    const flipUp = panelH > 0 && spaceBelow < panelH + gap && spaceAbove > spaceBelow;
    const top = flipUp ? Math.max(gap, r.top - panelH - gap) : r.bottom + gap;
    if (align === "right") setCoords({ top, right: window.innerWidth - r.right });
    else setCoords({ top, left: r.left });
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const reposition = () => place();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                role="menu"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  right: coords.right,
                  zIndex: 60,
                }}
                className="min-w-[210px] origin-top overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-elevated)] p-1 shadow-[var(--shadow-md)]"
              >
                {items.map((item, i) =>
                  item === "divider" ? (
                    <div key={i} className="my-1 h-px bg-[var(--color-line)]" />
                  ) : (
                    <button
                      key={i}
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onClick();
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-3 py-2 text-left text-sm transition-colors disabled:opacity-40",
                        item.danger
                          ? "text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)]"
                          : "text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]"
                      )}
                    >
                      {item.icon && <span className="text-[var(--color-ink-subtle)]">{item.icon}</span>}
                      {item.label}
                    </button>
                  )
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
