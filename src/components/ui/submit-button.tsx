"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  className?: string;
  /** Set when the form is submitted through useFormAction. */
  pending?: boolean;
};

export function SubmitButton({ children, pendingLabel = "Please wait…", pending: pendingProp, ...props }: Props) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
