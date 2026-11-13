"use client";

import { Ellipsis, LogOut, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { isActivePath, NAV_ICONS, type NavItem } from "@/components/business/nav-items";
import { TabLink } from "@/components/business/nav-link";

type Props = {
  /** Shown as tabs. Keep to four so they fit beside "More" on a small phone. */
  primary: NavItem[];
  /** Everything else, reached through "More". */
  more: NavItem[];
  businessName: string;
};

/**
 * Phone navigation: a bar fixed to the bottom of the screen, where thumbs
 * reach, with the less-used pages in a sheet that slides up from it.
 */
export function MobileNav({ primary, more, businessName }: Props) {
  const sheet = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const moreIsActive = more.some((item) => isActivePath(pathname, item));
  const close = () => sheet.current?.close();

  return (
    <>
      <nav
        aria-label="Business"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 border-t border-white/10 bg-ink px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden"
      >
        {primary.map((item) => (
          <TabLink key={item.href} item={item} />
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => sheet.current?.showModal()}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 text-[0.6875rem] leading-none ${
            moreIsActive ? "font-extrabold text-accent" : "font-semibold text-nav"
          }`}
        >
          <Ellipsis aria-hidden className="size-6" strokeWidth={moreIsActive ? 2.5 : 2} />
          More
        </button>
      </nav>

      <dialog
        ref={sheet}
        aria-label="More pages"
        // A tap on the dimmed area outside the sheet lands on the dialog itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-0 text-ink open:animate-sheet-up md:hidden"
      >
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-chip" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-lg font-extrabold">{businessName}</p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-chip"
            >
              <X aria-hidden className="size-6" />
            </button>
          </div>

          <ul className="grid grid-cols-3 gap-2">
            {more.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const isActive = isActivePath(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-md px-2 text-center text-sm ${
                      isActive ? "bg-accent font-extrabold text-accent-ink" : "bg-paper font-bold active:bg-chip"
                    }`}
                  >
                    <Icon aria-hidden className="size-6" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
            <Link
              href="/businesses?all=1"
              onClick={close}
              className="flex min-h-12 items-center justify-center rounded-md border-2 border-ink px-3 text-sm font-extrabold uppercase tracking-wide"
            >
              Businesses
            </Link>
            <form method="post" action="/auth/signout">
              <button
                type="submit"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-danger px-3 text-sm font-extrabold uppercase tracking-wide text-danger"
              >
                <LogOut aria-hidden className="size-4" />
                Log out
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
