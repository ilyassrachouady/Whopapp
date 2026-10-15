import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
export async function GET() {
  let database: unknown = { state: "missing" };
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const catalog = await getCatalog();
      database = {
        state: "connected",
        prospects: catalog.prospects.length,
        closers: catalog.closers.length,
        offers: catalog.offers.length,
      };
    } catch {
      database = {
        state: "error",
        message:
          "Apply migrations and seed data, and verify Supabase credentials.",
      };
    }
  }
  return NextResponse.json(
    {
      database,
      whop: {
        state: process.env.WHOP_API_KEY ? "configured_unverified" : "mock",
        environment:
          process.env.WHOP_SANDBOX === "false" ? "production" : "sandbox",
        companyConfigured: Boolean(process.env.WHOP_COMPANY_ID),
        webhookConfigured: Boolean(process.env.WHOP_WEBHOOK_SECRET),
      },
      ghl: {
        state: process.env.GHL_API_KEY ? "configured_unverified" : "mock",
        locationConfigured: Boolean(process.env.GHL_LOCATION_ID),
        writesEnabled: process.env.GHL_WRITES_ENABLED === "true",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
