import "server-only";
import { getSession, getSupabase, saveSession } from "./supabase";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";
export async function processMockPayment(event: {
  id: string;
  checkout_session_id: string;
  whop_payment_id: string;
  amount_collected: number;
}) {
  const session = await getSession(event.checkout_session_id);
  if (!session || session.mode !== "mock") throw new Error("Invalid session");
  const db = getSupabase();
  if (db) {
    const { data, error } = await db.rpc("record_payment", {
      session_id: session.id,
      payment_id: event.whop_payment_id,
      collected: event.amount_collected,
    });
    if (error) throw error;
    return { received: true, mode: "mock", payment: data };
  }
  const dir = path.join(process.cwd(), ".data", "events");
  await mkdir(dir, { recursive: true });
  const key = Buffer.from(event.whop_payment_id).toString("hex");
  try {
    await writeFile(
      path.join(dir, `${key}.json`),
      JSON.stringify({
        ...event,
        contract_value: session.contract_value,
        is_pif:
          session.payment_type === "pif" &&
          event.amount_collected === session.contract_value,
      }),
      { flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      return { received: true, duplicate: true, mode: "mock" };
    throw error;
  }
  const records = await Promise.all(
    (await readdir(dir))
      .filter((name) => name.endsWith(".json"))
      .map(
        async (name) =>
          JSON.parse(
            await readFile(path.join(dir, name), "utf8"),
          ) as typeof event,
      ),
  );
  const total = records
    .filter((record) => record.checkout_session_id === session.id)
    .reduce((sum, record) => sum + record.amount_collected, 0);
  session.status = total >= session.contract_value ? "paid" : "partially_paid";
  await saveSession(session);
  return {
    received: true,
    mode: "mock",
    downstream: "GHL updates and automations are not enabled",
  };
}
