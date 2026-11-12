import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="bg-ink px-4 py-4">
        <div className="mx-auto w-full max-w-md">
          <Logo tone="light" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">{children}</main>
    </>
  );
}
