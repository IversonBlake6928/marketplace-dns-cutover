import { createServer } from "node:http";
import { createInfraiDnsClient, InfraiError } from "./infrai_dns.js";
import {
  applyMarketplaceCutover,
  cutoverRequestSchema,
} from "./marketplace_cutover.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const infrai = createInfraiDnsClient(apiKey);

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.method !== "POST" || request.url !== "/cutovers") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = cutoverRequestSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (!parsed.success) {
      response.writeHead(400).end(JSON.stringify({
        error: "Invalid cutover request",
        issues: parsed.error.issues,
      }));
      return;
    }
    const result = await applyMarketplaceCutover(infrai, parsed.data);
    response.writeHead(200).end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 :
      error instanceof InfraiError && error.status >= 400 && error.status < 500
        ? error.status
        : 502;
    const message = error instanceof Error ? error.message : "Request failed";
    response.writeHead(status).end(JSON.stringify({ error: message }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Cutover service listening on :${port}`));
