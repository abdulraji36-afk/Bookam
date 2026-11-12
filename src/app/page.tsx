import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui/button";

const POINTS = [
  {
    title: "Know your stock",
    body: "Every delivery in and every sale out is recorded, so the count on screen matches the count in the store."
  },
  {
    title: "Dispatch with confidence",
    body: "Group customer orders onto a trip, send it out, and see what is still waiting to go."
  },
  {
    title: "Get your returnables back",
    body: "Crates, cylinders, pallets: mark what customers must bring back and track it until it is home."
  }
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClass("ghost", "sm")}>
            Log in
          </Link>
          <Link href="/signup" className={buttonClass("primary", "sm")}>
            Start free
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        <section className="py-12 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Orders, dispatch and returns for any depot, shop or warehouse.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            Bookam runs the daily movement of goods for your business. You decide which products must
            come back and which are simply sold.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className={buttonClass("primary")}>
              Start your 14-day free trial
            </Link>
            <Link href="/login" className={buttonClass("secondary")}>
              Log in
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {POINTS.map((point) => (
            <div key={point.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">{point.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{point.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
