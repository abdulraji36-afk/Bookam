"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A row of product cards that scrolls sideways. A finger swipes it; with a
 * mouse, the ‹ › buttons above it move one screenful at a time. The buttons
 * only show when there is more to see, and never on a touch screen.
 */
export function CardRail({ label, children }: { label: string; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ back: false, forward: false });

  const update = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const back = el.scrollLeft > 4;
    const forward = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((now) => (now.back === back && now.forward === forward ? now : { back, forward }));
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    update();
    // The list changes when a category is picked or a card opens up.
    const watch = new ResizeObserver(update);
    watch.observe(el);
    if (el.firstElementChild) watch.observe(el.firstElementChild);
    return () => watch.disconnect();
  }, [update]);

  const move = (direction: 1 | -1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: direction * Math.max(200, el.clientWidth * 0.8), behavior: "smooth" });
  };
  const arrow =
    "grid size-9 place-items-center rounded-full border-2 border-ink bg-white text-ink transition hover:bg-ink hover:text-white disabled:border-line disabled:text-line disabled:hover:bg-white";

  return (
    <div>
      {edges.back || edges.forward ? (
        <div className="mb-2 hidden justify-end gap-2 pointer-fine:flex">
          <button type="button" className={arrow} onClick={() => move(-1)} disabled={!edges.back} aria-label={`Show earlier ${label}`}>
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button type="button" className={arrow} onClick={() => move(1)} disabled={!edges.forward} aria-label={`Show more ${label}`}>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      ) : null}
      <div ref={rail} onScroll={update} className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2">
        {children}
      </div>
    </div>
  );
}
