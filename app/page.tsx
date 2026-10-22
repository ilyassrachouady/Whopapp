import PaymentDesk from "@/components/payment-desk";
import { prospects, closers, offers } from "@/lib/config";
import { getCatalog } from "@/lib/catalog";
import { loadCallProspect } from "@/lib/prospect-service";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const contactId =
    typeof query.contactId === "string" ? query.contactId : undefined;
  const loadedProspect = contactId ? await loadCallProspect(contactId) : null;
  const demoMode = process.env.PUBLIC_DEMO === "true";
  const catalog = demoMode
    ? { prospects, closers, offers }
    : await getCatalog({ includeContactOwners: true });
  const linkedProspect = loadedProspect ? catalog.prospects.find(p => p.id === loadedProspect.id) || null : null;
  const unavailableContacts = "unavailableContacts" in catalog ? catalog.unavailableContacts || 0 : 0;
  if (!catalog.prospects.length) return <main className="mx-auto max-w-xl p-8"><h1>No current CRM prospects available</h1><p>The saved contacts could not be found in GHL. Add a current prospect before completing a call.</p><a href="/">Reload contacts</a></main>;
  return (
    <PaymentDesk
      key={contactId || "manual"}
      catalog={{
        ...catalog,
        prospects: linkedProspect
          ? [
              linkedProspect,
              ...catalog.prospects.filter((p) => p.id !== linkedProspect.id),
            ]
          : catalog.prospects,
      }}
      initialProspectId={linkedProspect?.id}
      contactError={
        contactId && !linkedProspect
          ? "Contact not found. Select a prospect below to continue."
          : unavailableContacts ? `${unavailableContacts} saved contact${unavailableContacts === 1 ? " is" : "s are"} no longer available in GHL and ${unavailableContacts === 1 ? "has" : "have"} been hidden.` : ""
      }
      demoMode={demoMode}
      whopMode={
        !demoMode &&
        process.env.WHOP_MODE === "real" &&
        process.env.WHOP_API_KEY
          ? process.env.WHOP_SANDBOX === "false"
            ? "Live configured"
            : "Sandbox configured"
          : "Mock"
      }
      ghlMode={
        !demoMode && process.env.GHL_MODE === "real" && process.env.GHL_API_KEY
          ? "Configured"
          : "Mock"
      }
    />
  );
}
