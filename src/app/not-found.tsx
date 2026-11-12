import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-extrabold uppercase tracking-tight">We could not find that page</h1>
      <p className="mt-2 text-sm text-ink-soft">
        The link may be wrong, or you may not have access to this business.
      </p>
      <Link href="/businesses" className={`${buttonClass("secondary")} mt-6 self-start`}>
        Go to your businesses
      </Link>
    </main>
  );
}
