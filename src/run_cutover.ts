import { createInfraiDnsClient } from "./infrai_dns.js";
import {
  applyMarketplaceCutover,
  cutoverRequestSchema,
} from "./marketplace_cutover.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the cutover");

const input = cutoverRequestSchema.parse({
  domain: "example.com",
  hostname: "market.example.com",
  previousTarget: "marketplace-old.example.net",
  nextTarget: "marketplace-new.example.net",
  stage: process.env.CUTOVER_STAGE ?? "prepare",
  changeId: process.env.CHANGE_ID ?? "market-2026-09-28",
  sellerAssetIds: ["catalog-images", "seller-downloads"],
  buyerAudience: "active-buyers",
  openOrderIds: ["order-1042", "order-1043"],
});

const result = await applyMarketplaceCutover(createInfraiDnsClient(apiKey), input);
console.log(JSON.stringify(result, null, 2));
