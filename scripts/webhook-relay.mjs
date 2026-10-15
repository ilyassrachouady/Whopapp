import http from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
await mkdir(".data", { recursive: true });
const server = http.createServer(async (req, res) => {
  if (req.url !== "/api/webhooks/whop") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" });
    res.end("POST only");
    return;
  }
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        res.writeHead(413);
        res.end("Payload too large");
        return;
      }
      chunks.push(chunk);
    }
    const headers = {};
    for (const name of [
      "content-type",
      "webhook-id",
      "webhook-timestamp",
      "webhook-signature",
    ])
      if (req.headers[name]) headers[name] = req.headers[name];
    const response = await fetch("http://127.0.0.1:3000/api/webhooks/whop", {
      method: "POST",
      headers,
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(45000),
    });
    const body = await response.text();
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(body);
    const receipt = { at: new Date().toISOString(), status: response.status };
    await appendFile(
      ".data/webhook-deliveries.jsonl",
      JSON.stringify(receipt) + "\n",
    );
    console.log(JSON.stringify(receipt));
  } catch {
    res.writeHead(502);
    res.end("Local webhook unavailable");
  }
});
server.listen(3001, "127.0.0.1", () =>
  console.log("Webhook-only relay: http://127.0.0.1:3001/api/webhooks/whop"),
);
