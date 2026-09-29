import assert from "node:assert/strict";
import test from "node:test";
import { planMarketplaceCutover } from "../src/marketplace_cutover.js";

const request = {
  domain: "example.com",
  hostname: "market.example.com",
  previousTarget: "market-old.example.net",
  nextTarget: "market-new.example.net",
  changeId: "change-42",
  sellerAssetIds: ["photos", "manuals"],
  buyerAudience: "open-sessions",
  openOrderIds: ["order-7"],
};

test("rollback restores the prior destination for DNS and open orders", () => {
  const plan = planMarketplaceCutover({ ...request, stage: "rollback" });

  assert.deepEqual(plan.dns, {
    target: "market-old.example.net",
    ttl: 300,
  });
  assert.deepEqual(plan.orderHandoff, [{
    orderId: "order-7",
    destination: "market-old.example.net",
  }]);
  assert.equal(plan.sellerAssets[0]?.hostname, "market.example.com");
  assert.match(plan.buyerUpdate.message, /restored/);
});
