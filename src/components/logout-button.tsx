import { Button } from "@/components/ui/button";

export function LogoutButton({ variant = "ghost" }: { variant?: "ghost" | "secondary" }) {
  return (
    <form method="post" action="/auth/signout">
      <Button type="submit" variant={variant} size={variant === "ghost" ? "sm" : "md"}>
        Log out
      </Button>
    </form>
  );
}
