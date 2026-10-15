import { createDemoDepositCheckout } from "@/lib/deposits";
import { z } from "zod";
import { notFound } from "next/navigation";
import { CheckoutPreview } from "@/components/checkout-preview";
import { createDemoCheckout, calculatePlan } from "@/lib/demo";
import { prospects, offers, closers } from "@/lib/config";
export default async function DemoCheckout({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const prospect = prospects.find((p) => p.id === query.prospect),
    offer = offers.find((o) => o.id === query.offer),
    closer = closers.find((c) => c.id === query.closer);
  if (!prospect || !closer || (query.type !== "deposit" && !offer)) notFound();
  let session;
  try {
    if (query.type === "deposit") {
      session = createDemoDepositCheckout({
        prospect,
        closer,
        amount: Number(query.amount),
        schedule: {
          follow_up_date: String(query.date),
          follow_up_time: String(query.time),
          time_zone: String(query.zone),
        },
        origin: "https://demo.invalid",
      });
    } else {
      const type = z.enum(["pif", "two", "three", "custom"]).parse(query.type);
      const custom =
        typeof query.custom === "string"
          ? z
              .object({
                dueToday: z.number(),
                remainingPayments: z.number(),
                futureAmount: z.number(),
                firstDate: z.string(),
              })
              .parse(JSON.parse(query.custom))
          : undefined;
      const plan = calculatePlan(offer!, type, custom);
      session = createDemoCheckout({
        prospect,
        offer: offer!,
        closer,
        plan,
        origin: "https://demo.invalid",
      });
    }
  } catch {
    notFound();
  }
  return (
    <CheckoutPreview session={session} prospectName={prospect.full_name} />
  );
}
