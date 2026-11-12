import type { Metadata } from "next";
import { createBusinessAction } from "@/app/actions/organizations";
import { AccountBar } from "@/components/account-bar";
import { BusinessForm } from "@/components/business/business-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Set up your business" };

export default function OnboardingPage() {
  return (
    <>
      <AccountBar />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <Card>
          <h1 className="text-xl font-semibold">Set up your business</h1>
          <p className="mb-5 mt-1 text-sm text-slate-600">
            This creates your workspace. You can invite your staff straight after.
          </p>
          <BusinessForm
            action={createBusinessAction}
            submitLabel="Create business"
            pendingLabel="Creating…"
          />
        </Card>
      </main>
    </>
  );
}
