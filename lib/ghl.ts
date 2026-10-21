import "server-only";
import { z } from "zod";
import { prospects } from "./config";
export const ghlMode = () =>
  process.env.GHL_MODE === "real" ? "real" : "mock";
export async function searchContacts(query: string) {
  if (ghlMode() !== "real")
    throw new Error("Live CRM search is not configured.");
  const params = new URLSearchParams({
    locationId: process.env.GHL_LOCATION_ID!,
    query,
    limit: "20",
  });
  const data = await request(`/contacts/?${params}`);
  return z
    .array(contactSchema)
    .parse(data.contacts)
    .filter((c) => c.locationId === process.env.GHL_LOCATION_ID)
    .map((c) => ({
      id: c.id,
      name:
        c.name ||
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        c.email ||
        "Contact",
      email: c.email || "",
      phone: c.phone || "",
    }));
}
const contactSchema = z
  .object({
    id: z.string(),
    locationId: z.string(),
    assignedTo: z.string().nullish(),
    name: z.string().nullish(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .passthrough();
const opportunitySchema = z
  .object({
    id: z.string(),
    locationId: z.string(),
    contactId: z.string(),
    pipelineId: z.string(),
    pipelineStageId: z.string(),
  })
  .passthrough();
export async function request(path: string, method = "GET", body?: unknown) {
  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID)
    throw new Error(
      "Configure a GHL location and its private integration token.",
    );
  const response = await fetch(`https://services.leadconnectorhq.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      Version: process.env.GHL_API_VERSION || "v3",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `GHL request failed (${response.status}). Check account permissions and configuration.`,
    );
  return response.json();
}
export async function getContact(id: string) {
  if (ghlMode() === "mock")
    return (
      prospects.find((p) => p.id === id || p.ghl_contact_id === id) ?? null
    );
  const data = await request(`/contacts/${encodeURIComponent(id)}`);
  const contact = contactSchema.parse(data.contact);
  if (contact.locationId !== process.env.GHL_LOCATION_ID)
    throw new Error("Contact belongs to a different GHL account.");
  return contact;
}
export async function getOpportunity(id: string) {
  if (ghlMode() === "mock") return { mode: "mock", opportunity: null };
  const data = await request(`/opportunities/${encodeURIComponent(id)}`);
  const opportunity = opportunitySchema.parse(data.opportunity);
  if (opportunity.locationId !== process.env.GHL_LOCATION_ID)
    throw new Error("Opportunity belongs to a different GHL account.");
  return opportunity;
}
async function verifiedContact(id: string) {
  if (id.startsWith("ghl_contact_"))
    throw new Error("Use a real GHL test contact, not a demo prospect.");
  const contact = await getContact(id);
  if (!contact || !("locationId" in contact))
    throw new Error("A live GHL contact is required.");
  return contact;
}
function writesEnabled() {
  if (process.env.GHL_WRITES_ENABLED !== "true")
    throw new Error(
      "GHL writes are disabled. Confirm the target account before enabling them.",
    );
}
export async function sendSMS(contactId: string, message: string) {
  if (ghlMode() === "mock")
    return {
      mode: "mock",
      messageId: "mock_sms",
      conversationId: contactId,
      message,
    };
  writesEnabled();
  await verifiedContact(contactId);
  const data = await request("/conversations/messages", "POST", {
    type: "SMS",
    contactId,
    message,
    status: "pending",
  });
  return z
    .object({ messageId: z.string(), conversationId: z.string() })
    .parse(data);
}
export async function sendEmail(
  contactId: string,
  subject: string,
  html: string,
) {
  if (ghlMode() === "mock")
    return {
      mode: "mock",
      messageId: "mock_email",
      conversationId: contactId,
      subject,
    };
  writesEnabled();
  await verifiedContact(contactId);
  if (!process.env.GHL_EMAIL_FROM)
    throw new Error("Configure a verified GHL sender email.");
  const data = await request("/conversations/messages", "POST", {
    type: "Email",
    contactId,
    subject,
    html,
    emailFrom: process.env.GHL_EMAIL_FROM,
    status: "pending",
  });
  return z
    .object({ messageId: z.string(), conversationId: z.string() })
    .parse(data);
}
export async function updateOpportunity(
  id: string,
  patch: {
    pipelineStageId?: string;
    status?: "open" | "won" | "lost" | "abandoned";
    monetaryValue?: number;
    assignedTo?: string;
  },
) {
  if (ghlMode() === "mock") return { mode: "mock", id, patch };
  writesEnabled();
  await getOpportunity(id);
  return request(`/opportunities/${encodeURIComponent(id)}`, "PUT", patch);
}
export async function addPaymentInformation(
  contactId: string,
  body: string,
  userId?: string,
) {
  if (ghlMode() === "mock") return { mode: "mock", contactId, body };
  writesEnabled();
  await verifiedContact(contactId);
  return request(`/contacts/${encodeURIComponent(contactId)}/notes`, "POST", {
    body,
    ...(userId ? { userId } : {}),
  });
}
export async function createFollowUpTask(
  contactId: string,
  title: string,
  body: string,
  dueDate: string,
  assignedTo?: string,
) {
  if (ghlMode() === "mock")
    return { mode: "mock", contactId, title, body, dueDate, assignedTo };
  writesEnabled();
  await verifiedContact(contactId);
  return request(`/contacts/${encodeURIComponent(contactId)}/tasks`, "POST", {
    title,
    body,
    dueDate,
    completed: false,
    ...(assignedTo ? { assignedTo } : {}),
  });
}

export const addNote = addPaymentInformation;
export async function updateContactType(
  contactId: string,
  type: "customer" | "lead",
  live = false,
) {
  if (!live || ghlMode() === "mock") return { status: "mock", contactId, type };
  // Public contact PUT does not document the native type field. Delegate the
  // native Customer write to a verified GHL workflow rather than inventing it.
  const workflowId = process.env.GHL_CUSTOMER_TYPE_WORKFLOW_ID;
  if (!workflowId || type !== "customer")
    throw new Error("Configure a verified GHL Customer-type workflow.");
  await enrollContactWorkflow(contactId, workflowId);
  return { status: "delegated_to_ghl", contactId, type, workflowId };
}
export const updateGHLContactToCustomer = (contactId: string, live = false) =>
  updateContactType(contactId, "customer", live);
async function enrollContactWorkflow(contactId: string, workflowId: string) {
  writesEnabled();
  if (ghlMode() !== "real")
    throw new Error("Enable real GHL mode before enrollment.");
  await verifiedContact(contactId);
  return request(
    `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(workflowId)}`,
    "POST",
    {},
  );
}
export async function triggerPaymentWorkflow(contactId: string) {
  const workflowId = process.env.GHL_PAYMENT_WORKFLOW_ID;
  if (!workflowId)
    throw new Error("Configure the verified GHL PaymentWorkflow ID.");
  await enrollContactWorkflow(contactId, workflowId);
  return { workflowId, contactId };
}

// Check exact CRM identifiers before creating; never overwrite a matching contact.
export async function createOrFindContact(input: {
  name: string;
  email: string;
  phone: string;
}) {
  if (ghlMode() !== "real") throw new Error("Live CRM is not configured.");
  writesEnabled();
  for (const identifier of [input.email, input.phone].filter(Boolean)) {
    const params = new URLSearchParams({
      locationId: process.env.GHL_LOCATION_ID!,
      ...(identifier === input.email
        ? { email: identifier }
        : { number: identifier }),
    });
    const existing = await request(`/contacts/search/duplicate?${params}`);
    if (existing.contact) {
      const contact = contactSchema.parse(existing.contact);
      if (contact.locationId !== process.env.GHL_LOCATION_ID)
        throw new Error("Contact account mismatch.");
      return { contactId: contact.id, existing: true };
    }
  }
  const data = await request("/contacts/", "POST", {
    locationId: process.env.GHL_LOCATION_ID,
    name: input.name,
    email: input.email,
    ...(input.phone ? { phone: input.phone } : {}),
    source: "Payment Desk",
  });
  const contact = contactSchema.parse(data.contact);
  if (contact.locationId !== process.env.GHL_LOCATION_ID)
    throw new Error("Contact account mismatch.");
  return { contactId: contact.id, existing: false };
}

export async function assignContactOwner(contactId: string, userId: string) {
  if (ghlMode() !== "real") return { status: "mock" };
  writesEnabled();
  const contact = await verifiedContact(contactId);
  if (contact.assignedTo !== userId) {
    await request(`/contacts/${encodeURIComponent(contactId)}`, "PUT", {
      assignedTo: userId,
    });
  }
  const verified = await verifiedContact(contactId);
  if (verified.assignedTo !== userId)
    throw new Error("GHL assignment could not be verified.");
  return { status: "synced", assignedTo: userId };
}

export async function ensureContactCallNote(
  contactId: string,
  marker: string,
  body: string,
) {
  if (ghlMode() !== "real") return { status: "mock" as const };
  writesEnabled();
  await verifiedContact(contactId);
  const notesSchema = z.array(z.object({ id: z.string(), body: z.string() }));
  const list = await request(
    `/contacts/${encodeURIComponent(contactId)}/notes`,
  );
  const existing = notesSchema
    .parse(list.notes)
    .find((note) => note.body.includes(marker));
  if (existing)
    return { status: "synced" as const, noteId: existing.id, duplicate: true };
  const created = await request(
    `/contacts/${encodeURIComponent(contactId)}/notes`,
    "POST",
    { body },
  );
  const noteId = z.string().parse(created.note?.id);
  const readback = await request(
    `/contacts/${encodeURIComponent(contactId)}/notes/${encodeURIComponent(noteId)}`,
  );
  if (readback.note?.body !== body)
    throw new Error("GHL call note could not be verified.");
  return { status: "synced" as const, noteId, duplicate: false };
}
