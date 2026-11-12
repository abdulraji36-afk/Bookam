import Link from "next/link";

/** The wordmark. Use tone="light" on the dark navy bars. */
export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={`inline-block text-2xl font-extrabold uppercase tracking-wide ${
        tone === "light" ? "text-white" : "text-ink"
      }`}
    >
      Bookam
    </Link>
  );
}
