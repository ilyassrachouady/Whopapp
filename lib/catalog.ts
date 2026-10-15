import "server-only";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getContact } from "./ghl";
import { getCloserRoster } from "./closer-roster";
import { getSupabase } from "./supabase";
import {
  prospects as demoProspects,
  closers as demoClosers,
  offers as demoOffers,
} from "./config";
import type { Prospect, Closer, Offer } from "./types";
const prospectSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  ghl_contact_id: z.string(),
  ghl_opportunity_id: z.string().nullable(),
  lead_source: z.string().nullable(),
  call_id: z.string().nullable(),
  appointment_id: z.string().nullable().optional(),
  trakyo_id: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
});
export interface Catalog {
  prospects: Prospect[];
  closers: Closer[];
  offers: Offer[];
  mode: "database" | "mock";
}
export async function getCatalog(
  options: { includeContactOwners?: boolean } = {},
): Promise<Catalog> {
  if (process.env.PAYMENT_DESK_LOCAL_TEST === "true" && !process.env.VERCEL) {
    const fixture = JSON.parse(
      await readFile(
        path.join(process.cwd(), ".data", "live-test-catalog.json"),
        "utf8",
      ),
    );
    return { ...fixture, mode: "mock" };
  }
  const db = getSupabase();
  if (!db)
    return {
      prospects: demoProspects,
      closers: demoClosers,
      offers: demoOffers,
      mode: "mock",
    };
  const responses = await Promise.all([
    db
      .from("prospects")
      .select(
        "id,full_name,email,phone,ghl_contact_id,ghl_opportunity_id,lead_source,call_id,appointment_id,trakyo_id,utm_source,utm_medium,utm_campaign",
      )
      .order("created_at"),
    db.from("closers").select("id,name,email,ghl_user_id").order("created_at"),
    db
      .from("offers")
      .select("id,name,slug,price")
      .eq("active", true)
      .order("created_at"),
  ]);
  if (responses.some((r) => r.error))
    throw new Error(
      "Database schema is not ready. Apply the migrations and seed data.",
    );
  const prospects = responses[0]
    .data!.map((raw) => {
      const row = prospectSchema.parse(raw);
      return {
        ...row,
        phone: row.phone || "",
        ghl_opportunity_id: row.ghl_opportunity_id || "",
        lead_source: row.lead_source || "",
        call_id: row.call_id || "",
        appointment_id: row.appointment_id || undefined,
        trakyo_id: row.trakyo_id || "",
        utm_source: row.utm_source || "",
        utm_medium: row.utm_medium || "",
        utm_campaign: row.utm_campaign || "",
      };
    })
    .filter(
      (p) =>
        p.call_id &&
        (process.env.GHL_MODE !== "real" ||
          !p.ghl_contact_id.startsWith("ghl_contact_")),
    );
  const closers =
    process.env.GHL_MODE === "real"
      ? await getCloserRoster()
      : responses[1].data!.map((raw) => {
          const row = z
            .object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
              ghl_user_id: z.string().nullable(),
            })
            .parse(raw);
          return {
            ...row,
            initials: row.name
              .split(" ")
              .map((s) => s[0])
              .join("")
              .slice(0, 2),
          };
        });
  const offers = responses[2].data!.map((raw) => {
    const row = z
      .object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        price: z.coerce.number().int().positive(),
      })
      .parse(raw);
    const preset = demoOffers.find((o) => o.id === row.id);
    return {
      ...row,
      paymentOptions: preset?.paymentOptions,
      whopProductId: preset?.whopProductId,
      enableCardCheckout: preset?.enableCardCheckout,
      badge: preset?.badge || "OFFER",
      description: preset?.description || "",
    };
  });
  if (!prospects.length || !closers.length || !offers.length)
    throw new Error(
      "Add prospects with call IDs, closers and active offers before using Payment Desk.",
    );
  if (options.includeContactOwners && process.env.GHL_MODE === "real") {
    // Bound parallelism for larger CRM lists.
    for (let index = 0; index < prospects.length; index += 5) {
      await Promise.all(
        prospects.slice(index, index + 5).map(async (prospect) => {
          const contact = await getContact(prospect.ghl_contact_id);
          if (contact && "assignedTo" in contact) {
            Object.assign(prospect, {
              assigned_ghl_user_id: contact.assignedTo || null,
              closer_id: closers.find(
                (closer) =>
                  closer.ghl_user_id &&
                  closer.ghl_user_id === contact.assignedTo,
              )?.id,
            });
          }
        }),
      );
    }
  }
  return { prospects, closers, offers, mode: "database" };
}
