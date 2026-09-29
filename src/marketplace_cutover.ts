import { z } from "zod";
import type { InfraiDnsClient } from "./infrai_dns.js";

export const cutoverRequestSchema = z.object({
  domain: z.string().min(1),
  hostname: z.string().min(1),
  previousTarget: z.string().min(1),
  nextTarget: z.string().min(1),
  stage: z.enum(["prepare", "cutover", "rollback"]),
  changeId: z.string().min(1),
  sellerAssetIds: z.array(z.string().min(1)).min(1),
  buyerAudience: z.string().min(1),
  openOrderIds: z.array(z.string().min(1)),
}).strict();

export type CutoverRequest = z.infer<typeof cutoverRequestSchema>;

export type CutoverPlan = {
  dns: { target: string; ttl: number };
  sellerAssets: Array<{ assetId: string; hostname: string }>;
  buyerUpdate: { audience: string; message: string };
  orderHandoff: Array<{ orderId: string; destination: string }>;
};

export function planMarketplaceCutover(input: CutoverRequest): CutoverPlan {
  const target = input.stage === "rollback" ? input.previousTarget :
    input.stage === "cutover" ? input.nextTarget : input.previousTarget;
  const ttl = input.stage === "prepare" ? 60 : 300;
  const action = input.stage === "rollback" ? "restored" :
    input.stage === "cutover" ? "moved" : "prepared";

  return {
    dns: { target, ttl },
    sellerAssets: input.sellerAssetIds.map((assetId) => ({
      assetId,
      hostname: input.hostname,
    })),
    buyerUpdate: {
      audience: input.buyerAudience,
      message: `Marketplace hostname ${action}: ${input.hostname}`,
    },
    orderHandoff: input.openOrderIds.map((orderId) => ({
      orderId,
      destination: target,
    })),
  };
}

export async function applyMarketplaceCutover(
  infrai: InfraiDnsClient,
  input: CutoverRequest,
) {
  const plan = planMarketplaceCutover(input);
  const { zone_id } = await infrai.dns.domain.get(input.domain);
  await infrai.dns.record.upsert({
    zone_id,
    record_type: "CNAME",
    name: input.hostname,
    content: plan.dns.target,
    ttl: plan.dns.ttl,
    metadata: { change_id: input.changeId, stage: input.stage },
  }, `${input.changeId}:${input.stage}`);

  return { changeId: input.changeId, stage: input.stage, zone_id, ...plan };
}
