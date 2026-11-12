import "server-only";
import { connection } from "next/server";

/**
 * The current time for this request. Reading the clock is only allowed once
 * rendering is tied to a real request, which is what connection() guarantees.
 */
export async function requestNow() {
  await connection();
  return Date.now();
}
