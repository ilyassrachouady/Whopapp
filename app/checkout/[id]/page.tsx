import Link from "next/link";
import { getSession } from "@/lib/supabase";
import { money, paymentLabels, prospects } from "@/lib/config";
import { notFound } from "next/navigation";
import { ShieldCheck, ArrowLeft, Link2 } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function MockCheckout({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session || session.mode !== "mock") notFound();
  const prospect = prospects.find((p) => p.id === session.prospect_id);
  return (
    <main style={{ maxWidth: 470, margin: "10vh auto", padding: 24 }}>
      <Link
        href="/"
        style={{
          display: "flex",
          gap: 7,
          alignItems: "center",
          color: "#71717c",
          fontSize: 12,
          marginBottom: 30,
        }}
      >
        <ArrowLeft size={14} />
        Back to Payment Desk
      </Link>
      <section className="summary-card">
        <span className="brand-symbol">
          <Link2 size={20} />
        </span>
        <div className="card-eyebrow" style={{ marginTop: 22 }}>
          MOCK CHECKOUT PREVIEW
        </div>
        <h1 style={{ fontSize: 25, marginTop: 20 }}>
          {session.metadata.offer_name}
        </h1>
        <p style={{ color: "#71717c", marginTop: 12 }}>
          Prepared for {prospect?.full_name}
        </p>
        <dl className="summary-lines">
          <div>
            <dt>Contract value</dt>
            <dd>{money(session.contract_value)}</dd>
          </div>
          <div className="due-today">
            <dt>Due today</dt>
            <dd>{money(session.amount_due_today)}</dd>
          </div>
          <div>
            <dt>Payment structure</dt>
            <dd>{paymentLabels[session.payment_type]}</dd>
          </div>
        </dl>
        <p style={{ fontSize: 12, lineHeight: 1.8, color: "#71717c" }}>
          This is a preview of your generated checkout. No payment details are
          requested and no charge will be made.
        </p>
        <div className="schedule-note">
          <ShieldCheck size={16} />
          Your payment link and sales context have been saved.
        </div>
      </section>
    </main>
  );
}
