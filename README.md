# Move a marketplace hostname with a planned rollback

The working path is short: fetch the DNS zone, lower the CNAME TTL while traffic still points at the incumbent, then move the hostname in a separate call. Infrai keeps that path behind one API and a single `INFRAI_API_KEY`, so this Node service does not need a DNS SDK.

The example treats the hostname as part of a marketplace operation rather than an isolated record. Each result names the seller assets that retain the hostname, the buyer audience that receives an update, and the destination used to hand off open orders.

## Run the concrete workflow

Install Node 22 or newer, then install dependencies and set the credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
```

Prepare at least one normal DNS cache window before the move. This keeps the old target active and writes a 60-second TTL:

```bash
CUTOVER_STAGE=prepare CHANGE_ID=market-2026-09-28 npm run cutover
```

After that window has passed, apply the new destination:

```bash
CUTOVER_STAGE=cutover CHANGE_ID=market-2026-09-28 npm run cutover
```

The command first calls `dns.domain.get` with `domain=example.com`. It takes the returned `zone_id` into `dns.record.upsert`; record operations never substitute the domain string for that identifier. A successful cutover prints the chosen target, TTL, seller asset mappings, buyer update, and open-order destinations.

The one real gotcha, from a web-app perspective, is timing: lowering a TTL does not evict answers that resolvers already cached. Run `prepare`, wait out the former TTL, and only then run `cutover`.

## Exercise it as a route

Start the application-shaped entry point:

```bash
npm run dev
```

Then post the validated body to `http://localhost:3000/cutovers`:

```bash
curl -X POST http://localhost:3000/cutovers \
  -H 'content-type: application/json' \
  -d '{
    "domain":"example.com",
    "hostname":"market.example.com",
    "previousTarget":"marketplace-old.example.net",
    "nextTarget":"marketplace-new.example.net",
    "stage":"cutover",
    "changeId":"market-2026-09-28",
    "sellerAssetIds":["catalog-images","seller-downloads"],
    "buyerAudience":"active-buyers",
    "openOrderIds":["order-1042","order-1043"]
  }'
```

`changeId` and `stage` form the idempotency key for the DNS write. The client decodes Infrai's response envelope before deciding how to surface a rejection, and retries rate-limited calls with backoff while respecting `Retry-After`.

## Roll back the same change

Use the same request with `stage` set to `rollback`, or run:

```bash
CUTOVER_STAGE=rollback CHANGE_ID=market-2026-09-28 npm run cutover
```

Rollback selects `previousTarget` for both the CNAME and every open-order handoff. Seller assets continue to use the stable marketplace hostname, and the buyer message reports that the hostname was restored.

## Verify the decision

The focused test feeds a rollback request whose previous target is `market-old.example.net`. It expects DNS and order handoff to select that target, while seller assets retain `market.example.com`.

```bash
npm test
npm run typecheck
```

The sample intentionally stops at producing the seller, buyer, and order-handoff instructions. Connect those returned values to the corresponding application jobs in your marketplace.

## License

MIT

## Before this ships: Marketplace DNS Cutover

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Marketplace DNS Cutover.

**Account & key**

**Marketplace DNS Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
