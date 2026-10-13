import { z } from "zod";
import {
  followUpReasons,
  noSaleReasons,
  unqualifiedReasons,
} from "./call-options";
const base = {
  prospectId: z.string().min(1),
  closerId: z.string().min(1),
  notes: z.string().trim().max(4000).default(""),
};
const schedule = {
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  follow_up_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  time_zone: z.string().min(1).max(80),
};
export const completeCallSchema = z.union([
  z.object({
    ...base,
    call_outcome: z.literal("sold"),
    checkout_session_id: z.uuid(),
  }),
  z.object({
    ...base,
    call_outcome: z.literal("follow_up"),
    ...schedule,
    follow_up_reason: z.enum(followUpReasons),
    next_step: z.string().trim().min(1, "Enter the next step.").max(1000),
  }),
  z.object({
    ...base,
    call_outcome: z.literal("no_sale"),
    loss_reason: z.enum(noSaleReasons),
  }),
  z.object({
    ...base,
    call_outcome: z.literal("unqualified"),
    loss_reason: z.enum(unqualifiedReasons),
  }),
  z.object({
    ...base,
    call_outcome: z.literal("no_show"),
    reschedule_needed: z.literal(true),
    ...schedule,
  }),
  z.object({
    ...base,
    call_outcome: z.literal("no_show"),
    reschedule_needed: z.literal(false),
  }),
]);
export function validateSchedule(
  input: {
    follow_up_at: string;
    follow_up_date: string;
    follow_up_time: string;
    time_zone: string;
  },
  now = Date.now(),
) {
  const date = new Date(input.follow_up_at);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now)
    throw new Error("Choose a future follow-up date and time.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.time_zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  if (
    `${part("year")}-${part("month")}-${part("day")}` !==
      input.follow_up_date ||
    `${part("hour")}:${part("minute")}` !== input.follow_up_time
  )
    throw new Error("The follow-up date and time do not match your time zone.");
}

// Convert a wall-clock appointment in an explicit IANA zone, independent of host/browser defaults.
export function resolveSchedule(
  input: { follow_up_date: string; follow_up_time: string; time_zone: string },
  now = Date.now(),
) {
  const [year, month, day] = input.follow_up_date.split("-").map(Number);
  const [hour, minute] = input.follow_up_time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(wall))
    throw new Error("Choose a valid follow-up date and time.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.time_zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let instant = wall;
  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (name: string) =>
      Number(parts.find((p) => p.type === name)?.value);
    const actualWall = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    );
    if (actualWall === wall) break;
    instant += wall - actualWall;
  }
  const result = { ...input, follow_up_at: new Date(instant).toISOString() };
  validateSchedule(result, now);
  return result;
}
