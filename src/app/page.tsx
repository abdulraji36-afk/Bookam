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
      <div className="bg-ink text-white">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <Logo tone="light" />
          <nav className="flex items-center gap-2">
            <Link href="/login" className={buttonClass("inverse", "sm")}>
              Log in
            </Link>
            <Link href="/signup" className={buttonClass("primary", "sm")}>
              Start free
            </Link>
          </nav>
        </header>

        <section className="mx-auto w-full max-w-5xl px-4 pb-14 pt-10 sm:pb-20 sm:pt-16">
          <h1 className="max-w-3xl text-4xl font-extrabold uppercase leading-none tracking-tight sm:text-6xl">
            Orders, dispatch and returns for any depot, shop or warehouse.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-nav">
            Bookam runs the daily movement of goods for your business. You decide which products must
            come back and which are simply sold.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className={buttonClass("primary")}>
              Start your 14-day free trial
            </Link>
            <Link href="/login" className={buttonClass("inverse")}>
              Log in
            </Link>
          </div>
        </section>
      </div>

      <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-4 px-4 py-8 sm:grid-cols-3 sm:py-10">
        {POINTS.map((point) => (
          <div key={point.title} className="rounded-md bg-white p-5">
            <h2 className="border-b-[3px] border-ink pb-2 text-lg font-extrabold uppercase tracking-wide">
              {point.title}
            </h2>
            <p className="mt-3 text-ink-soft">{point.body}</p>
          </div>
        ))}
      </main>
    </div>
  );
}
