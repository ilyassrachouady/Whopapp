import { z } from "zod";
import type { Closer } from "./types";
export const OTHER_CLOSER_ID = "desk-other";
export const otherCloserNameSchema = z.string().trim().max(100).optional();
export function resolveCloser(
  closers: Closer[],
  id: string,
  otherName?: string,
): Closer | undefined {
  const closer = closers.find((row) => row.id === id);
  if (!closer) return undefined;
  if (id !== OTHER_CLOSER_ID) return closer;
  const name = z
    .string()
    .trim()
    .min(2, "Enter the other closer’s name.")
    .max(100)
    .parse(otherName || "");
  return {
    ...closer,
    name,
    initials: name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2),
  };
}
