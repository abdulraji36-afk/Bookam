export type ActionState<T = undefined> = {
  ok: boolean;
  message: string;
  data?: T;
};

export const idleState: ActionState<never> = { ok: false, message: "" };

type DbError = { code?: string; message: string } | null;

/**
 * Turns a database error into something safe to show. Messages we raise
 * ourselves in SQL (code P0001) are written for people; anything else is not.
 */
export function describeDbError(error: DbError, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "You do not have permission to do this.";
  if (error.code === "28000") return "You must be logged in.";
  return fallback;
}
