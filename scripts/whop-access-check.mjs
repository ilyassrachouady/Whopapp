import { readFile } from "node:fs/promises";
const env = {};
for (const line of (await readFile(".env.local", "utf8")).split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
}
for (const [name, origin] of [
  ["sandbox", "https://sandbox-api.whop.com/api/v1"],
  ["production", "https://api.whop.com/api/v1"],
]) {
  try {
    const response = await fetch(
      `${origin}/plans?account_id=${encodeURIComponent(env.WHOP_COMPANY_ID)}&first=1`,
      {
        headers: { Authorization: `Bearer ${env.WHOP_API_KEY}` },
        signal: AbortSignal.timeout(12000),
      },
    );
    const data = await response.json().catch(() => ({}));
    console.log(
      JSON.stringify({
        environment: name,
        status: response.status,
        readOnly: true,
        plansReturned: Array.isArray(data.data) ? data.data.length : undefined,
        errorCode: data.error?.code || data.code,
      }),
    );
  } catch {
    console.log(JSON.stringify({ environment: name, reachable: false }));
  }
}
