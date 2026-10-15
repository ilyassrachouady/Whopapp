import { prospects } from "./config";
import type { Prospect } from "./types";
// The call page depends on this interface, so a future GHL adapter can replace
// fixture lookup without changing the closer's workflow or exposing API keys.
export interface ProspectService {
  getByContactId(contactId: string): Promise<Prospect | null>;
}
export const mockGhlProspectService: ProspectService = {
  async getByContactId(contactId) {
    return (
      prospects.find(
        (p) =>
          contactId === `mock_${p.id}` ||
          contactId === p.ghl_contact_id ||
          contactId === p.id,
      ) ?? null
    );
  },
};
export async function loadCallProspect(
  contactId: string,
  service?: ProspectService,
) {
  if (!contactId || contactId.length > 128) return null;
  if (service) return service.getByContactId(contactId);
  if (process.env.PUBLIC_DEMO !== "true" && process.env.GHL_MODE === "real") {
    const { getCatalog } = await import("./catalog");
    const catalog = await getCatalog();
    return catalog.prospects.find(p => p.ghl_contact_id === contactId || p.id === contactId) ?? null;
  }
  return mockGhlProspectService.getByContactId(contactId);
}
