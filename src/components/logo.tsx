import Link from "next/link";

/** The mark: a "B" made of an amber spine and two stacked loads. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="7" fill="#f5a30a" />
      <rect x="8" y="7" width="4.5" height="18" rx="1" fill="#0b1f33" />
      <path d="M14 7h4.5a4 4 0 0 1 0 8H14z" fill="#0b1f33" />
      <path d="M14 17h5.5a4 4 0 0 1 0 8H14z" fill="#0b1f33" />
    </svg>
  );
}

/**
 * The mark with the wordmark. The name is written "BukAm", so it keeps its
 * own capitals. Use tone="light" on the dark navy bars.
 */
export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 text-2xl font-extrabold tracking-tight ${
        tone === "light" ? "text-white" : "text-ink"
      }`}
    >
      <LogoMark />
      BukAm
    </Link>
  );
}
