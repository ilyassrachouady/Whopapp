import { z } from "zod";
export const closerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase().max(254),
  ghl_user_id: z
    .union([z.literal(""), z.string().regex(/^[a-zA-Z0-9]{20,24}$/)])
    .optional(),
});
export const newContactSchema = z.object({
  name: z.string().trim().min(2, "Enter the contact’s name.").max(100),
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
  phone: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^\+[1-9]\d{6,14}$/,
          "Use international format, e.g. +447700900123.",
        ),
    ])
    .default(""),
});
