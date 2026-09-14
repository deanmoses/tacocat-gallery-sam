# Edge-cached albums

Serve album API responses from CloudFront so that an album arrives as fast as the SvelteKit shell does (about 80ms to Northern California by the Grafana probe, against roughly 300ms from the API today). What is built is described in [Architecture.md](../Architecture.md#api-edge-cache); this page records the reasoning, the answers to the questions the design raised, and what is left.

## Status

Prototype, deployed to staging and test only (`EdgeCacheEnabled` condition in `template.yaml`, false in prod). The distribution has no custom domain; its hostname is the `ApiEdgeDomain` stack output. Moving `api.<domain>` onto it, and the gallery app's `?fresh` re-reads after a save, are the two changes that would make it live.

## Design

The cache key for an album is its version, so an edit invalidates nothing: it moves the version, and the next request misses. This avoids CloudFront path invalidations (slow, and they cost past the free thousand a month) and it works per album.

Versions live in a CloudFront KeyValueStore and are read by a viewer-request CloudFront Function; a DynamoDB stream Lambda keeps them current; the origin sets an ETag and answers `If-None-Match` with a 304. The details, including exactly which store keys a change to a media item or album moves, are in the Architecture doc.

### Why a content hash rather than a counter

The version is a hash of the album's response body. A counter or timestamp bumped on every change under an album would be cheaper to compute (no DynamoDB reads) but would move the root's version on every edit anywhere, and the root is the most viewed album. With a content hash, editing a day album's description recomputes the root's hash and finds it unchanged, so the root keeps hitting. The cost is three `getAlbum`-sized reads per stream batch, deduped across the batch.

### Why prev/next get their own key

An album's `prev`/`next` depend on its siblings' `published` flags, so publishing one album changes every sibling's response. Recomputing every sibling's hash on each edit would be some fifty `getAlbum` reads against a 3 RCU table. Instead the sibling-dependent part is hashed once per parent (`nav:<parent>`) and joined into the cache key, so one key moves on a publish and the day-to-day edits (description, thumbnail, uploads) touch only the album and its parent.

### Admin and guest responses

Admins see unpublished albums, so the two responses differ and are cached separately: the function sets `x-has-token` from the same cookie-existence test the origin makes, and the cache policy keys on it. The origin still decides on the forwarded cookie; the header only separates the entries. The one hash covers both variants: it is computed from the admin's view, and every change a guest could see is a change an admin sees, so the guest key moves whenever it must, and occasionally when it needn't (an edit to an unpublished child), which costs one miss.

Note that `x-has-token` inherits the existing weakness of `isAuthenticatedForReads()`: any `id_token` cookie, valid or not, gets the admin response. That is what the API does today and the cache does not widen it, but it is worth knowing that the admin cache entries are reachable with a forged cookie.

### ETag and 304

The origin sets `ETag` to a hash of the body and answers a matching `If-None-Match` with a 304. That serves three cases: CloudFront revalidating an expired entry against the origin (a 304 refreshes the entry without a body), a browser revalidating against the edge (CloudFront answers from cache, the origin is never touched), and direct callers. It is worth having at the origin even though the DynamoDB work is done by then, because the transfer is what the client waits on.

For the browser side to benefit, the gallery app has to send `If-None-Match` from the album it holds in IndexedDB and treat a 304 as "what you have is current". That is a gallery app change.

### Keeping the admin who just saved current

After a save the gallery app re-reads the album and its parents, and for a few seconds the store still holds the old version, so the edge would serve the old response. The app should add `?fresh` to those re-reads. The function turns it into a one-off version, which is a miss that fetches from the origin. Everyone else keeps getting the old entry until the version propagates, which is the accepted lag.

The idea of the admin's client computing the new hash itself does not work: the server sets `updatedOn` on save, and the hash covers it, so the client cannot predict the body.

### Old versions in the cache

CloudFront evicts per edge location by how recently an object was requested; an old version stops being requested the moment the key moves, so it is among the first to go and does not push live albums out. No cleanup needed, and no publish-time special case.

### Compression

CloudFront is set to compress, but the origin already compresses (`MinimumCompressionSize` on API Gateway), so what the edge caches is API Gateway's gzip and CloudFront will not re-encode it as Brotli. Leaving that on keeps the direct `api.` path fast during the prototype, which is where the gallery app still points. When `api.` moves to CloudFront, drop `MinimumCompressionSize` and let CloudFront compress, at which point it will serve Brotli where accepted.

### The other endpoints

Everything but `GET /album*` passes through the same distribution uncached, because a hostname belongs to one distribution. This costs a cold edge-to-origin connection on most requests (the same-origin prototype measured about 220ms of it) that the direct path does not pay, and for search, `latest-album` and the write endpoints nothing is gained. The album pages are what visitors wait on, so it is a fair trade, but it should be measured. Two ways to claw it back if it matters: cache `latest-album` and search on short TTLs, or Origin Shield in us-east-1 to keep a warmer connection to the region.

## Operating it

- After the first deploy, invoke `SyncAlbumVersions` with `{}` to populate the store; until then every album is served uncached. If the result carries `nextStartAfter`, invoke again with `{ "startAfter": "<that path>" }`.
- Hit rate: `x-edge-result-type` in the access logs under `api/` in the CloudFront logs bucket.
- If `UpdateAlbumVersions` drops a batch (it retries three times, then the errors show in its log stream), the affected versions stay stale until the cache entry's day-long `s-maxage` runs out, or `SyncAlbumVersions` is run. An alarm on its errors would be the right thing but the account is at the free tier's ten alarm metrics.
- The edge cache's TTL is a day. Most albums see few requests per day per edge location, so a shorter TTL would mean most requests miss; the version in the key, not the TTL, is what keeps entries current.

## Still to do

1. Measure: the Grafana probe against `ApiEdgeDomain`, hit rate from the logs, and a cold-miss cost for the uncached endpoints.
2. Gallery app: `?fresh` on post-save re-reads; `If-None-Match` from IndexedDB; point staging at `ApiEdgeDomain` to try it end to end.
3. Promote: an `api.<domain>` alias and certificate on the distribution, the API Gateway custom domain moved to a non-custom domain, `MinimumCompressionSize` dropped, the `EdgeCacheEnabled` condition removed.
4. Maybe: rate-limiting bots at the edge (AWS WAF, from about five dollars a month), caching search and `latest-album`, Origin Shield.
