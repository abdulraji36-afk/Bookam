import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const TONES: Record<Tone, string> = {
  error: "border-danger bg-danger-soft text-danger",
  success: "border-success bg-success-soft text-success",
  info: "border-ink-soft bg-chip text-ink"
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`animate-pop-in rounded-md border-2 px-3 py-2.5 text-sm font-semibold ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}

/** Shows the result of a server action, if there is one. */
export function FormMessage({ state }: { state: { ok: boolean; message: string } }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}
