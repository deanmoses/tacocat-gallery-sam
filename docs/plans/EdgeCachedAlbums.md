# Edge-cached albums

Serve album API responses from CloudFront so that an album arrives as fast as the SvelteKit shell does (about 80ms to Northern California by the Grafana probe, against roughly 300ms from the API today). This page records the design, the reasoning, what was measured, and what is left.

## Status

Built on the branch `claude/getalbum-caching-nextprev-as8yq8` of this repo, the hosting repo and the gallery app, and run on staging; not merged. On that branch the API is served as `/api/*` on the site's own domain through the site's distribution, with album responses cached on a per-album version, so the cache sits in the real request path, with the real auth cookie, and there was no domain to move. The branch's `docs/Architecture.md` describes the pieces.

Measured on staging on 2026-09-16 and 17 (see _What a miss costs_): a hit is one round trip to the nearest edge, but every request that reaches the origin through the distribution pays for the edge's cold connection to Virginia, about 35ms next to the region and about 300ms from Paris, on every request, and Origin Shield does not remove it. A week of production logs (see _What the hit rate would be_) puts the album hit rate at roughly 35-40%, below the break-even that miss cost sets, because most album views are the first of that page at that edge in a week. As built, with API Gateway as the origin, the cache does not pay. With S3 as the origin a miss costs about what the direct path costs today and every hit is gain; see _An S3 origin_. That is the open decision, pending one measurement from a visitor's location.

## Design

The cache key for an album is its version, so an edit invalidates nothing: it moves the version, and the next request misses. This avoids CloudFront path invalidations (slow, and they cost past the free thousand a month) and it works per album.

Versions live in a CloudFront KeyValueStore and are read by a viewer-request CloudFront Function; a DynamoDB stream Lambda keeps them current; the origin sets an ETag and answers `If-None-Match` with a 304. The details, including exactly which store keys a change to a media item or album moves, are in the Architecture doc.

### Why a content hash rather than a counter

The version is a hash of the album's response body. A counter or timestamp bumped on every change under an album would be cheaper to compute (no DynamoDB reads) but would move the root's version on every edit anywhere, and the root is the most viewed album. With a content hash, editing a day album's description recomputes the root's hash and finds it unchanged, so the root keeps hitting. The cost is three `getAlbum`-sized reads per stream batch, deduped across the batch.

### Why the album response has no prev/next

The API used to return `prev`/`next` links with each album. They depend on the siblings' `published` flags, so publishing one album changed every sibling's response, and every sibling's cache entry with it: a publish would have flushed the whole year, and the current year is the hottest set. The first cut kept the fields and hashed the sibling-dependent part once per parent into a second key (`nav:<parent>`) joined into the cache key. That worked, but it was the one place where a resource's cacheability depended on its siblings, and it cost a peer query on every `getAlbum`.

The fields are gone instead. The gallery app computes prev/next from the parent album's child list, which it fetches alongside the album (without a refetch when it already has it), is the hottest cache entry after the root, and is the same list the server walked, already filtered to what the viewer may see. The app had derived a media item's prev/next from its album this way all along. With that, an album's response depends on nothing outside its own subtree and the cache key is its own content version.

The gallery app change shipped first, since `getAlbum` is not behind the staging condition; this backend change must not reach production before it.

### Why there is no latest-album endpoint

The homepage's "latest album" thumbnail used to come from `GET /latest-album`: the current year's newest published album with its thumbnail. That is the last published child of the current year album's response, which the app fetches for the day pages' prev/next anyway and holds in IndexedDB. Caching the endpoint separately would have meant a key with its own dependencies (any day album of the current year, that album's thumbnail image, and the calendar, since the current year changes with no DynamoDB write), and a TTL-only cache at this traffic would rarely hit. The app reads the thumbnail off the year album instead, and the endpoint is gone. Same ordering: the app shipped first.

### Why the origin writes the first version

The first cut had a `SyncAlbumVersions` Lambda to recompute every album's version: run once after the store is created, and again to repair a dropped stream batch. It was a scan of the table with pagination and timeout handling, plus an operating step to remember after the first deploy and a Lambda invoke permission for whoever ran it. The stream Lambda already moves a version on every change, so all the sync was really for was the first version of each album.

Now `GetAlbum` writes that. A request the edge handled but found no version for is answered uncached anyway, and the origin writes the response's ETag hash as the album's version on the way out. Two rules keep that safe. It writes only when the store still has no version for the album: any hash of the content will do as a first version, but a "write if different" rule would fight the stream Lambda, whose hash is over the admin's view and never matches a body hash. And the write names the store's ETag from before the origin looked, and gives up on a conflict rather than retrying: two overlapping first fetches straddling an edit could otherwise put back a label under which stale content is already cached. Repair after a dropped batch is the day-long TTL, or deleting the album's key by hand, which the lazy write then refills.

### Admin and guest responses

Admins see unpublished albums, so the two responses differ and are cached separately: the function sets `x-has-token` from whether an `id_token` cookie is present, and the cache policy keys on it. The origin decides on the forwarded cookie, and it verifies the token; the header only separates the entries. The one hash covers both variants: it is computed from the admin's view, and every change a guest could see is a change an admin sees, so the guest key moves whenever it must, and occasionally when it needn't (an edit to an unpublished child), which costs one miss.

The edge cannot verify a Cognito token (no RSA in CloudFront Functions), so its test and the origin's disagree whenever the cookie is present but invalid, usually expired: the edge says admin, the origin answers with the guest view and reports `X-Auth-Status: invalid`. Cached as is, that guest body would sit under the admin key until the version moved. So the origin must answer `no-store` whenever its verdict disagrees with the `x-has-token` it was sent, which is not yet in `respondCacheable()`. The alternative is not to cache the admin variant at all: the function gives a cookie-bearing request a one-off version, the origin answers `no-store` for a verified token, and the `x-has-token` key dimension goes away.

### ETag and 304

The origin sets `ETag` to a hash of the body and answers a matching `If-None-Match` with a 304. That serves three cases: CloudFront revalidating an expired entry against the origin (a 304 refreshes the entry without a body), a browser revalidating against the edge (CloudFront answers from cache, the origin is never touched), and direct callers. It is worth having at the origin even though the DynamoDB work is done by then, because the transfer is what the client waits on.

For the browser side to benefit, the gallery app has to send `If-None-Match` from the album it holds in IndexedDB and treat a 304 as "what you have is current". That is a gallery app change.

### Keeping the admin who just saved current

After a save the gallery app re-reads the album and its parents, and for a few seconds the store still holds the old version, so the edge would serve the old response. The app should add `?fresh` to those re-reads. The function turns it into a one-off version, which is a miss that fetches from the origin. Everyone else keeps getting the old entry until the version propagates, which is the accepted lag.

The idea of the admin's client computing the new hash itself does not work: the server sets `updatedOn` on save, and the hash covers it, so the client cannot predict the body.

### Old versions in the cache

CloudFront evicts per edge location by how recently an object was requested; an old version stops being requested the moment the key moves, so it is among the first to go and does not push live albums out. No cleanup needed, and no publish-time special case.

### Compression

The origin compresses (`MinimumCompressionSize` on API Gateway), so what the edge caches is API Gateway's gzip and CloudFront will not re-encode it as Brotli. It stays that way because CloudFront only compresses what it caches, and search and the write responses pass through uncached; Brotli on album bodies is not worth serving the rest uncompressed.

### Why the site's distribution, and the other endpoints

The first cut put a second distribution in front of the API on its own CloudFront hostname, for measurement, with a plan to move `api.<domain>` onto it. Serving the API as `/api/*` on the site's own domain instead needs no DNS change, no second certificate, retires CORS and `credentials: 'include'`, and lets the cache be tested with a real admin cookie, since the cookie is first-party. The earlier same-origin prototype (see the sveltekit project's `docs/plans/Observability.md`) found it no faster, because every request that reaches the origin pays a cold edge-to-origin handshake that the direct path hides under the shell download. The cache changes that for album reads: a hit reaches no origin and rides the connection the browser already holds for the shell. It changes nothing for the requests that always reach the origin, and the measurements below say the handshake is paid on every one of them, not only after a lull, so the keep-warm ping this section once proposed would not help.

### Why the stream Lambda reads eventually consistent

`UpdateAlbumVersions` recomputes an album's hash from DynamoDB within milliseconds of the write that changed it, when a replica may not have caught up, so its first cut used consistent reads. They cost twice the read units, and the table is provisioned at 3 read units in every environment (the free tier is 25 across the account, and three environments at 10 would exceed it, which is why it stays at 3). The stream record carries the row as the write left it (`StreamViewType: NEW_IMAGE`), which is exactly the row a replica could be behind on, so the Lambda lays the batch's own rows over what the table returns instead, and every read is eventually consistent. The `dynamoToRedis` stream consumer never had the problem: it indexes the record's `NewImage` and reads nothing.

## What a miss costs

Measured on staging on 2026-09-16 (before Origin Shield) and 2026-09-17 (with it), by requesting album paths that do not exist, so that every request reaches the origin, alternating the same-origin path (`/api/album/...` on the site) with the direct one (`api.<domain>`). The client was a cloud session behind a proxy whose exit hopped between Virginia and Paris, which made a poor stopwatch and a good experiment: the numbers that matter are the edge's own, from the distribution's access log (`time-to-first-byte` is the edge's whole service time, `origin-fbl` how long it waited for the origin's first byte), and the origin's own, from the API Gateway access log (`responseLatency`). Medians:

| Where the edge was | Origin's own time | Edge waited for origin | Edge time to first byte | Same, with Origin Shield |
| ------------------ | ----------------- | ---------------------- | ----------------------- | ------------------------ |
| Virginia (IAD)     | 25ms              | 30ms                   | 67ms                    | 69ms (waited 35ms)       |
| Paris (CDG)        | 25ms              | 273ms                  | 360ms                   | 394ms (waited 130ms)     |

What that says:

- **The origin is not the cost.** API Gateway plus Lambda plus DynamoDB answered a `GetAlbum` 404 in about 25ms on every path. The direct call from the same client took about 70ms after its TLS handshake, which is that plus one round trip.
- **The cost is the edge's connection to the region, paid every time.** From Paris the edge waited 273ms for a 25ms origin: a TCP and TLS handshake to Virginia and then the request, three or four round trips at full distance. Consecutive requests one second apart from the same edge location each paid it in full, so the origin keep-alive (`OriginKeepaliveTimeout: 60` on the hosting distribution) is not being reused between a visitor's own requests at this traffic level, and no ping would keep warm a connection the next request does not land on.
- **Origin Shield moves the cost, it does not remove it.** With a shield in us-east-1 the wait for the origin halved from Paris, and the edge's total time to first byte did not move at all: the time went to the new leg between the edge and the shield. Next to the region it was slightly worse. It was removed. One thing to know if it is ever tried again: deleting the `OriginShield` property from the template leaves the shield on; CloudFormation has to deploy `Enabled: false` explicitly before the property can go.
- **A cache hit is one round trip to the nearest edge.** From the same client a hit on the root album took 54ms after TLS, which is the client's distance to the edge and nothing else. On the edge's clock a function-only response (`/robots.txt`) takes 9ms and a hit a few milliseconds more, so the version lookup in the KeyValueStore costs next to nothing.
- **S3 as the origin skips the handshake, not the trip.** Measured the same way (misses on `/_app/immutable/` paths that do not exist, against API misses, on the edge's clock): from Virginia an S3 miss takes 42ms against the API's 86ms, from Paris 288ms against 360ms. CloudFront's connections to S3 are warmer than to a custom origin, about 45ms near the region and 70ms far from it, and the far-away miss is still 280ms. Whether that is good enough depends on what it is compared with; see _An S3 origin_.
- **Nothing keeps an album in the cache.** Each edge location evicts by recency, there is no reserve tier, and warming can only be done from the places visitors happen to be. The regional edge caches between an edge and the origin hold more for longer, and a miss served from one shows in the access log as an `origin-fbl` of a few milliseconds; whether they hold the gallery's albums is unknown until real traffic flows.
- **Lambda cold starts are not a production cost.** Staging's first request after hours of idleness waited 727ms for the origin, but that is staging. In a week of production album fetches, 1% took over 300ms; the median was 44ms, and the median after more than an hour with no album fetch at all was 79ms. `GetAlbum` stays warm at this traffic level, so removing the Lambda from the read path buys little on its own.
- **A Lambda Function URL as the origin would not help.** It removes API Gateway's share, which is inside the 25ms, and keeps the edge-to-region handshake. It would also cost the API Gateway access log these measurements came from, the origin's gzip setting, and a resource policy on the Lambda that has to name the hosting distribution while the hosting stack imports the URL from this one.

So from the visitor's side: album hits are as fast as the shell; a miss from far away costs roughly 300ms more than calling the API directly would, and about 35ms more from nearby; and search, writes and `?fresh` re-reads pay that on every request. Whether the cache earns its keep is the hit rate, and whether the uncached calls should keep going through the distribution is the decision below.

## What the hit rate would be

Measured from a week of production access logs (2026-09-11 to 17), before any album was cached, using two stand-ins.

**How long an edge keeps an object.** The site's `/_app/immutable/` chunks never change and carry a year's TTL, so a miss on a chunk an edge served earlier can only be eviction. Repeat requests for the same chunk at the same edge, by the gap since the previous one: 96-98% hit up to three hours, 93% at three to six, about 81% from six hours to a day, 68% at one to three days, none after three days. It varies by edge: the two carrying most of the site's traffic, LAX and SFO, still hit around 90% after six to 24 hours, while ATL, a large edge, drops to zero in that window. The idea that a busy edge evicts within an hour does not hold for the edges this site's visitors use. The image distribution's thumbnails tell the same story.

**Whether the same album is asked for again at the same edge in time.** A thumbnail request for `/i/<year>/<day>/` is an album page view at that edge, and the thumbnails' hit rate on a repeat view is what the album JSON would get. Excluding bots: 79 page views in the week, at 15 edges, of 16 distinct pages; the root 33, the newest album 18, its year 9, everything else one to four each. 34 of the 79 views, 43%, were the first view of that page at that edge all week, which the album cache cannot serve. On the other 57%, the thumbnails hit 74% within an hour of the previous view, 59% at one to six hours, 84% at six to 24, 43% at one to three days; 69% at LAX, 97% at SFO, 32% at ATL. Put together, roughly 35-40% of album fetches would be edge hits, against the 50% or so the miss cost needs to break even. The API access log agrees on concentration: 240 album fetches in the week, 89 of them for the newest album, 38 distinct albums.

The cache loses, then, but not because edges evict fast. The traffic is too thin and too spread out: most album views are the first of that page at that edge in a week.

## An S3 origin

The comparison that matters is not the origin's 25ms but what a visitor pays today: the album leg of a page load measured 341ms from Northern California on the direct path, because the browser pays its own connection and round trips to Virginia before the Lambda's 25ms. Against that baseline, an S3 miss through the edge costs roughly what today costs, and a hit costs a round trip to the nearest edge. Estimated from San Francisco, whose visitors are served from Los Angeles:

| Path                                   | Hit   | Miss       |
| -------------------------------------- | ----- | ---------- |
| Today, direct to API Gateway           | n/a   | ~300ms     |
| Through CloudFront, API Gateway origin | ~80ms | ~500ms     |
| Through CloudFront, S3 origin          | ~80ms | ~250-300ms |

With API Gateway as the origin a 35-40% hit rate only breaks even, which is what the branch built. With S3 as the origin every hit is gain and no miss is a loss: at that hit rate the album leg averages about 200ms against 340ms today, it never gets worse, and reads stop touching Lambda and DynamoDB, which is resilience and read capacity for free. The Los Angeles miss figure is an estimate, since the measuring vantage never landed on that edge; it is the one number to take from a visitor's laptop before building (see _Still to do_).

What it would look like, mostly a reshaping of the branch:

- **Materialize.** `UpdateAlbumVersions` already computes each changed album's response to version it. It writes that response to S3 as two files, the guest view and the admin view with unpublished children, and then moves the version in the KeyValueStore, in that order so a version never points at a file that is not there yet. Same "which albums did this change touch" logic, same content hash, so an unchanged root is neither rewritten nor re-versioned.
- **Serve.** The site distribution's `/api/album*` behavior gets an S3 origin (through Origin Access Control) and there is no API origin on the site distribution at all. The edge function rewrites `/api/album/<path>` to the versioned key, choosing the guest or admin file by cookie presence, the same test the API's read check makes today and with the same weakness: any `id_token` cookie selects the admin file. The files are immutable with a year's TTL; S3 supplies the ETag, so browser revalidation is a 304 at the edge; CloudFront compresses at the edge, Brotli rather than API Gateway's gzip.
- **Everything else goes direct.** Writes, search and the admin's post-save `?fresh` re-reads go to `api.<domain>` as they do on main today, with the API's CORS configuration for the site's origin. Nothing uncached passes through the distribution, so nothing pays the edge-to-region handshake without a cache to show for it.
- **Backfill once.** A script writes every album's files and versions once. After that the stream keeps them current, and there is no per-deploy step, since the files persist. An origin group that fails over to API Gateway when the file is missing would avoid even the one-off script, at the cost of failover semantics on the read path; not worth it for a script that runs once per environment.
- **Housekeeping.** A lifecycle rule expires old versions after a week: the store always points at the latest, and no edge holds an entry longer than a few days. The lazy first version `GetAlbum` writes, and its `Cache-Control` logic, are no longer needed.

## Operating it

- Nothing to do after a deploy: the store fills itself, each album on its first request through the edge (see _Why the origin writes the first version_).
- Hit rate: `x-edge-result-type` in the access logs under `api/` in the CloudFront logs bucket.
- If `UpdateAlbumVersions` drops a batch (it retries three times, then the errors show in its log stream), the affected versions stay stale until the cache entry's day-long `s-maxage` runs out and the next request triggers a background refresh, which re-caches the current content under the stale label. To force it sooner, delete the album's `content:` key from the store and the next request re-versions it. An alarm on its errors would be the right thing but the account is at the free tier's ten alarm metrics.
- The edge cache's TTL is a day, with a year of `stale-while-revalidate` and `stale-if-error` after it, the longest the cache policy allows. The stale window's length is irrelevant to correctness: the first request past the day triggers the refresh however long it is, so a shorter window would only put the origin round trip back on some visitor's critical path. Most albums see few requests per day per edge location, so a shorter TTL would mean most requests miss; the version in the key, not the TTL, is what keeps entries current. The stale window means an expired entry is served at once and refreshed behind the visitor, and still serves if the origin is down. Browsers implement `stale-while-revalidate` too, against the `max-age=0`, which only matters once the gallery app stops sending `no-store`.

## Still to do

1. Measure an S3 miss from a visitor's location. From a laptop in the Bay Area, ten misses on the staging site's S3 origin against ten direct API calls, taking `time_starttransfer` minus `time_appconnect` on each:

    ```bash
    for i in $(seq 1 10); do
      curl -s -o /dev/null -w "s3miss %{time_starttransfer} %{time_appconnect}\n" "https://staging-pix.tacocat.com/_app/immutable/nope-$RANDOM$RANDOM.js"
      curl -s -o /dev/null -w "direct %{time_starttransfer} %{time_appconnect}\n" "https://api.staging-pix.tacocat.com/album/1999/03-0$((i % 9 + 1))/"
    done
    ```

    If the S3 lines come out at or below the direct ones, the S3 origin is a straight improvement; if well above, S3 does not help from that edge either.

2. Depending on that: reshape the branch to the S3 origin (see _An S3 origin_), or drop the edge cache and the same-origin API and keep only the API contract change (no prev/next in album responses, no latest-album endpoint), which stands on its own.
3. Gallery app: prefetch an album's siblings (the parent's child list, which the app holds) into IndexedDB after rendering it, so the next click never waits on the network, whatever the edge holds. This meets the goal of making rarely viewed albums feel fast better than anything on the CDN side, works whether the edge cache stays or goes, and warms the edge for the next visitor as a side effect.
4. Gallery app: `If-None-Match` from IndexedDB, so a browser revalidation against the edge costs a 304.
5. If the cache ships: promote with `CacheAlbumResponses=true` in the hosting stack's prod config, after the SAM and hosting stacks, in that order.
6. Maybe: rate-limiting bots at the edge (AWS WAF, from about five dollars a month), caching search on a gallery-wide version.
