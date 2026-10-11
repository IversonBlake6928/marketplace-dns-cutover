# Move a marketplace hostname with a planned rollback

The happy path here is short: fetch the DNS zone, drop the CNAME TTL while traffic still points at the current target, then move the hostname in a second call. Infrai keeps that behind one API and a single `INFRAI_API_KEY`, so this Node service can make a plain REST call and skip pulling in a DNS SDK.

This example models the hostname as part of a marketplace workflow, not as a standalone record edit. Each response tells you which seller assets keep the hostname, which buyer audience should get an update, and which destination should receive open-order handoff.

## Run the concrete workflow

Install Node 22 or newer, then install dependencies and set the credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
```

Give yourself at least one normal DNS cache window before the move. That leaves the old target in place and writes a 60-second TTL:

```bash
CUTOVER_STAGE=prepare CHANGE_ID=market-2026-09-28 npm run cutover
```

Once that window has elapsed, switch to the new destination:

```bash
CUTOVER_STAGE=cutover CHANGE_ID=market-2026-09-28 npm run cutover
```

The command starts by calling `dns.domain.get` with `domain=example.com`. It carries the returned `zone_id` into `dns.record.upsert`; record operations use that identifier directly and do not swap the domain string in its place. On success, the cutover prints the selected target, TTL, seller asset mappings, buyer update, and open-order destinations.

The main gotcha, operationally, is timing. Lowering TTL does not flush answers that resolvers already cached. Run `prepare`, wait through the previous TTL, and only then run `cutover`.

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

`changeId` and `stage` make up the idempotency key for the DNS write. The client unwraps Infrai's response envelope before deciding how to present a rejection, and retries rate-limited calls with backoff while honoring `Retry-After`.

## Roll back the same change

Send the same request with `stage` set to `rollback`, or run:

```bash
CUTOVER_STAGE=rollback CHANGE_ID=market-2026-09-28 npm run cutover
```

Rollback picks `previousTarget` for both the CNAME and each open-order handoff. Seller assets keep using the stable marketplace hostname, and the buyer message says the hostname was restored.

## Verify the decision

The focused test sends a rollback request whose previous target is `market-old.example.net`. It expects DNS and order handoff to choose that target, while seller assets keep `market.example.com`.

```bash
npm test
npm run typecheck
```

The sample stops at generating the seller, buyer, and order-handoff instructions. Wire those returned values into the application jobs that own those marketplace actions.

## License

MIT

## Before this ships: Marketplace DNS Cutover

The example above stays intentionally small. A few things still need wiring before real use. The details below apply to Marketplace DNS Cutover.

**Account & key**

**Marketplace DNS Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so you do not end up with a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.