import { CheckoutPreview } from "@/components/checkout-preview";
import { getCatalog } from "@/lib/catalog";
import { getSession } from "@/lib/supabase";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function MockCheckout({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session || session.mode !== "mock") notFound();
  const { prospects } = await getCatalog();
  const prospect = prospects.find((p) => p.id === session.prospect_id);
  return (
    <CheckoutPreview
      session={session}
      prospectName={prospect?.full_name || "Demo prospect"}
    />
  );
}
