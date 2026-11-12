import type { MemberRole } from "@/types/database";

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff"
};

export function daysUntil(isoDate: string | null, now: number) {
  if (!isoDate) return null;
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - now) / 86_400_000));
}

export function formatDate(isoDate: string, timeZone = "Africa/Lagos") {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone }).format(
    new Date(isoDate)
  );
}
