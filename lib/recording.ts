import { z } from "zod";
export const recordingUrlSchema = z
  .union([
    z.literal(""),
    z
      .url()
      .max(2000)
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Use an HTTPS recording link.",
      ),
  ])
  .default("");
export function recordingFromNotes(notes: string) {
  const match = notes.match(/(?:^|\n)Call recording: (https:\/\/[^\s]+)/);
  return match?.[1] || "";
}
export function withRecording(notes: string, url = "") {
  return url ? `${notes}\n\nCall recording: ${url}`.trim() : notes;
}
