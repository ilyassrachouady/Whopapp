import Link from "next/link";
import { money, paymentLabels } from "@/lib/config";
import { ShieldCheck, ArrowLeft, Link2 } from "lucide-react";
import type { CheckoutSession } from "@/lib/types";
export function CheckoutPreview({
  session,
  prospectName,
}: {
  session: CheckoutSession;
  prospectName: string;
}) {
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
          Prepared for {prospectName}
        </p>
        <dl className="summary-lines">
          {session.checkout_type === "sale" && (
            <div>
              <dt>Contract value</dt>
              <dd>{money(session.contract_value)}</dd>
            </div>
          )}
          <div className="due-today">
            <dt>Due today</dt>
            <dd>{money(session.amount_due_today)}</dd>
          </div>
          {session.checkout_type === "sale" && (
            <div>
              <dt>Remaining</dt>
              <dd>
                {money(session.contract_value - session.amount_due_today)}
              </dd>
            </div>
          )}
          <div>
            <dt>Payment type</dt>
            <dd>
              {session.checkout_type === "deposit"
                ? "One-time deposit"
                : paymentLabels[session.payment_type]}
            </dd>
          </div>
        </dl>
        <p style={{ fontSize: 12, lineHeight: 1.8, color: "#71717c" }}>
          Payment pending. This is a preview of your generated checkout. No
          payment details are requested and no charge will be made.
        </p>
        <div className="schedule-note">
          <ShieldCheck size={16} />
          This preview does not confirm a payment or grant product access.
        </div>
      </section>
    </main>
  );
}
