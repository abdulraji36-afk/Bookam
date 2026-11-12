import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";

/** Top bar for signed-in pages that sit outside a business. */
export function AccountBar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Logo href="/businesses" />
        <LogoutButton />
      </div>
    </header>
  );
}
