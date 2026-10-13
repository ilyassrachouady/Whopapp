import PaymentDesk from "@/components/payment-desk";
export default function Page() {
  return (
    <PaymentDesk
      whopMode={process.env.WHOP_API_KEY ? "Configured" : "Mock"}
      ghlMode={process.env.GHL_API_KEY ? "Configured" : "Mock"}
    />
  );
}
