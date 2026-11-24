"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The side menu's scrolling list. On a short laptop screen the menu is
 * longer than the screen, so it scrolls the page you are on into view and
 * fades out its bottom edge while more of the menu sits below.
 */
export function SideMenuScroll({ children }: { children: ReactNode }) {
  const menu = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const update = useCallback(() => {
    const el = menu.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = menu.current;
    if (!el) return;
    update();
    const watch = new ResizeObserver(update);
    watch.observe(el);
    return () => watch.disconnect();
  }, [update]);

  // Bring the highlighted page into view when it is hidden below (or above).
  useEffect(() => {
    const el = menu.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !current) return;
    // The menu is positioned, so offsetTop is measured from its top.
    const top = current.offsetTop;
    if (top < el.scrollTop || top + current.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top - el.clientHeight / 2 + current.offsetHeight / 2;
    }
    update();
  }, [pathname, update]);

  return (
    <nav
      ref={menu}
      aria-label="Business"
      onScroll={update}
      data-more={more ? "" : undefined}
      className="menu-scroll relative flex-1 overflow-y-auto px-3 py-2 data-more:[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]"
    >
      {children}
    </nav>
  );
}
