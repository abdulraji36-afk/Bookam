import { Button, type ButtonVariant } from "@/components/ui/button";

export function LogoutButton({ variant = "inverse" }: { variant?: ButtonVariant }) {
  return (
    <form method="post" action="/auth/signout">
      <Button type="submit" variant={variant} size="sm">
        Log out
      </Button>
    </form>
  );
}
