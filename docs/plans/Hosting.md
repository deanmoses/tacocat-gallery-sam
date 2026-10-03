# Hosting

I want to move pix.tacocat.com off of AWS to get both a faster and simpler architecture.

**Update Sept 22 2026**: the finalists are evaluated in [HostingDeepDive.md](./HostingDeepDive.md).

**Outcome, Oct 2 2026**: Cloudflare. The gallery moved on 2026-10-02 and lives in [tacocat-gallery-cloudflare](https://github.com/deanmoses/tacocat-gallery-cloudflare). What decided it was simplicity and developer ergonomics more than speed; its `docs/Risks.md` records each risk raised here and how it was closed against the real account, and its `docs/Perf.md` the measured comparison with this site.

## Faster

I want an architecture that can serve eventually consistent read requests in under 100ms globally, primarily from California, Louisiana and France. Consistent reads, database writes and media uploads can take longer, but I’d like to make those well under 1 second.

We can’t get there with AWS; we’ve reached the theoretical maximum of how fast we can make the site using AWS infrastructure. It’s a low volume site so most requests are cold: cold content that has fallen out of CloudFront cache and is served from Virginia, cold connections from the CDN to the Lambdas (again in Virginia) and the handshake time that entails, cold starts for JS Lambas (400-800ms!!!). We’ve experimented with edge caching the albums, but nothing we can do there will make it much faster; see `docs/plans/EdgeCachedAlbums.md` in the `tacocat-gallery-sam` repo.

## Simpler

I also want to take this opportunity to simplify the app’s surface area.

It’s currently composed of four separate GitHub repos plus other pieces (see `docs/Ecosystem.md` in the `tacocat-gallery-sveltekit` repo for the full details):

- `tacocat-gallery-sveltekit`: the SvelteKit SPA app
- `tacocat-gallery-hosting-aws`: the AWS SAM template for the SPA S3 hosting bucket and CloudFront CDN for pix.tacocat.com
- `tacocat-gallery-sam`: the AWS SAM back end: ~20 TypeScript Lambdas, a DynamoDB, image resizing, video processing
- `tacocat-gallery-auth`: the AWS SAM template for auth lambdas, connected to a manually-configured Cognito (I hate that it’s manually configured). This is all in service of only 4 logged in admins. Everybody else is a guest user. I really hate Cognito; I find it hard to use; I want social logins. Very happy to switch off it.
- **Search**: Redis in Redis Cloud, manually configured from the web UI. We use Redis because nothing in AWS gives fast search cheaply.
- **Analytics**: for analytics about how the site is performing, issue investigation, we currently use a custom DuckDB analytics DB defined in `tacocat-gallery-sveltekit`, run from localhost, that pulls logs from AWS. It feels janky, would love a better solution. See `docs/Observability.md` and `production_logs/README.md` in the `tacocat-gallery-sveltekit` repo for the details.

I’d rather have a single repo, or at most a SvelteKit and a back end repo, with all infrastructure configured from files in the repo rather than UI clicks. I feel this would:

- **Make it easier to manage infrequently**. I generally touch it once a year — upgrading packages and such — and having four repos is four times the surface area, four times the cost to modernize it. Improvements in testing setups and devops have to be re-thought through to apply to each of the four repos.
- **Make it friendlier for AI developer assistants**. Help Claude Code and Codex reason about the overall surface area.
- **Make it friendlier for other maintainers**. Enable my children be able to easily maintain the project.
- **Better integrate the front and back ends**. A single repo would make it easier for the front end to consume the back end API's TypeScript types.

As part of this simplification we would not leave any infrastructure in AWS.

Rather than a straight like-for-like migration, I'd want to leverage whatver platform features are available to make the overall system better, faster, more reliable, easier to reason about, easier to develop etc.

## Requirements

- **Sveltekit**. The web app is currently served as a static SPA, but I would consider moving to standard Sveltekit back end serving. It's currently a SPA because that eliminated a significant moving part (a Node.js back end), and almost every user is a return visitor that probably already has the SPA.
- **Typescript**. The app and APIs are developed in Typescript and must remain so. The front end and back end are separate Typescript right now, and I'd like that to go away: the front end should consume the types the back end produces.
- **Database**. The database is currently AWS DynamoDB, but it could easily be a relational DB at the edge. I'd be willing to explore moving to a simple KV store but I doubt that'd work.
    - **Database backups**. Backing up and restoring the DB is a requirement.
    - **ORM**. If we move to relational, I'm wondering if we should use an ORM or something else to manage the SQL.
        - A full ORM (Prisma, TypeORM) doesn't earn its keep here: the model is one table of albums and media with a `parentPath`/`itemName` hierarchy, the ~25 Dynamo calls are simple gets, child lists, prev/next lookups, field updates and subtree renames, and ORMs built around interactive transactions fight D1, which only has atomic `batch()` (a natural fit for the three `TransactWrite`s in `renameAlbum`, `renameMedia` and `updateAlbum`). Prisma is also the heaviest option for Worker bundle size and cold start.
        - Drizzle, a thin typed query builder, might be the sweet spot:
            - **Keeps the platform choice reversible**. First-class drivers for both D1 (`drizzle-orm/d1`) and libSQL (`drizzle-orm/libsql`, what Bunny Database runs on), so the schema and queries are the same on Cloudflare or Bunny.
            - **Migrations**. `drizzle-kit` diffs the TypeScript schema and writes reviewable SQL migrations, which matters more than the query builder for a DB meant to last decades (e.g. the pending `itemType: 'image'` → `'media'` rename).
            - **Typed JSON columns**. `text('thumbnail', { mode: 'json' }).$type<AlbumThumbnailEntry>()` keeps nested `thumbnail`, `dimensions` and `tags` as JSON with the existing types, no extra tables.
            - **Raw SQL escape hatch**. Anything Drizzle doesn't model goes through the ``sql`...` `` template.
            - Kysely is the main alternative, but its D1 and libSQL support are community dialects and it has no schema-driven migrations.
            - Plain raw SQL is also viable at this size; it just gives up the typed rows and generated migrations.
- **Search**. The search is currently in Redis. While I’m perfectly happy with Redis, I’d be fine moving it off Redis. Being able to manage it as infrastructure-as-code would be great.
    - **SQLite FTS5 could replace Redis**. Both D1 and libSQL support FTS5 full-text search, which would put search in the same database, backups and IaC, and eliminate the `dynamoToRedis` stream sync. Drizzle doesn't model FTS5 virtual tables, so they'd be created in a raw SQL migration and queried with ``sql`...` ``.
- **Edge caching**. Right now albums are served CloudFront → Lambda → DynamoDB. I'm willing to explore other architectures where albums are served directly from the CDN edge cache, see `docs/plans/EdgeCachedAlbums.md`, such as relying on a globally-distributed object store.
- **IaC**. Infrastructure as code or config. No clicking in dashboards. Enable AIs to better reason about and manage the infrastructure.
- **Multiple environments**: integration test, staging, production.
- **Custom domains**. pix.tacocat.com, staging-pix.tacocat.com, test-pix.tacocat.com.
    - I'm willing to move the DNS for tacocat.com to a new provider, though with ~30 years of stuff on it I’m a bit intimidated by the thought.
    - I'm willing to move APIs and Auth off their own subdomains (api.pix.tacocat.com → pix.tacocat.com/api ?).
- **Low # of users**. Well under a hundred real real users a week, if you don't count bots, scrapers and search engines -- which I want as gone as possible.
- **~50k photos**
    - Need HEIC -> JPG, WEBP, AVIF
    - Need resizing and cropping as it currently works. Not super willing to do resizing or cropping a different way.
- **< 1000 videos**
    - Need transcoding
- **Cheap**. Under $20/month, ideally under the current AWS cost of $12/mo.
- **Longevity**. I don’t want to use a platform that’s going to go out of business or suddenly hike the price to $50/month. The website has been in operation in some form or another since 2001 (25 years!) and I expect it to go for another 100 years.
- **Writes from Berkeley**. A lot of the writes (DB, media uploads) originate from Berkeley, CA (where we most often create and manage photo albums), so if there’s a choice to be made about where the write database lives, it’d be nice for it to be near there.
- **No public presence**. The site is not in search engines, every page returns noindex. AI training is prohibited. All images are copyright-protected. We disallow serving our images from other sites (like social media sharing)
- **Local emulation**. I hate how I can't really run or test the AWS stuff locally: lambdas and especially DynamoDB are hard to run locally, so I end up using lots of mocks. Dunno if there's a platform out there that is more friendly to testing and running locally, but I'd be interested in that. However, if all the edge-native solutions don't have that, then no matter.

## Options

There are now edge-native companies that have moved the applications to the edge, rather than depending on giant data centers (the Region approach of AWS and GCP).

### Cloudflare

Pros:

- **They're the default choice**. They serve 20% of the internet and have a ginormous developer base and free tier.
- **They've got the fastest cold starts** (apart maybe from Fastly who are too expensive). ~5ms typical, ~15ms worst case!
- **They won't abandon small developers**. As far as I can tell, they aren't going to switch to squeezing out the low-margin customers like me when the VC money runs out. The vast volume of free tier traffic enables them to negotiate cheap or free network routes worldwide. And all those websites allow them to detect new cyberattacks and roll out protection to their Fortune 500 customers.
- **Cloudflare D1**. Their native, serverless, globally replicated SQLite database. It acts much like a fast relational equivalent to DynamoDB.
- **Localhost emulation**. Sounds like Cloudflare runs D1, R2 and KV locally inside the real runtime and executes Vitest inside it? Sign me up.
- **Sveltekit SSR**. There's a very official [`adapter-cloudflare`](https://svelte.dev/docs/kit/adapter-cloudflare) that seems like it would support Sveltekit SSR?

Cons:

- **They're too big**. Cloudflare serves 20% of the internet. All things being equal, I'd rather not contribute to the winner-takes-all system and would prefer to give my business to someone else.
- **They have tiers**. I prefer a pay-as-you-go model because if we need something that suddenly bumps us up a too-expensive tier, there's not much we can do.
- **They require owning DNS**. To be on the free tier, they require that they manage the full DNS for all of tacocat.com.
- **Bunny's better at media**. See Bunny Optimizer and Bunny Stream in the [Bunny section](#bunnynet).

Cost:

| Cloudflare service         | Basis                                                                               | Per month |
| -------------------------- | ----------------------------------------------------------------------------------- | --------: |
| Workers, D1, static assets | Free plan (100k requests/day, 5M row reads/day)                                     |        $0 |
| Workers Paid               | Recommended for Logpush to R2 for your DuckDB pipeline and to lift the 10ms CPU cap |        $5 |
| R2 storage                 | 154GB across prod, staging and test, minus 10GB free, at $0.015/GB                  |     $2.20 |
| R2 operations, egress      |                                                                                     |        $0 |
| Images transformations     | 264 new a month against 5,000 free                                                  |        $0 |
| Stream                     | First 1,000-minute block covers your 30 to 60 minutes of video                      |        $5 |
| **Total**                  | About $7 without Workers Paid                                                       |  **~$12** |

### Bunny.net

Bunny.net is building out an edge architecture like Cloudflare's and I already use and like their CDN and DNS management for another project, Flipcommons.

Pros:

- **They aren't Cloudflare**. I'm looking for an alternative to Cloudflare, at least to more thoroughly evaluate, and Bunny.net seems to be the best challenger.
- **I like them**. I already use and like them. I like that they're in Europe.
- **[Edge Scripting](https://bunny.net/docs/scripting)**. It uses Deno (the open-source successor to Node.js built by Node's original creator, Ryan Dahl), which I like better than Cloudflare's Chromium-based approach, which is an older API.
- **[Bunny Optimizer](https://bunny.net/docs/optimizer)** (flat $9.50/mo for unlimited images) and **[Bunny Stream](https://bunny.net/docs/stream)** (auto video transcoding for pennies) apparently make media delivery drastically simpler and cheaper than Cloudflare (but this needs to be verified).
- **[Bunny Database](https://bunny.net/docs/database)**. A globally distributed, SQLite-compatible database built on Turso/libSQL (a fork of SQLite). As of Sept 22 2026 it's still in Public Preview, meaning breaking changes are unlikely but possible. I think I'd be willing to take on this risk to support Bunny.net, if that's the only drawback to Bunny.net. According to the [docs](https://bunny.net/docs/database/durability-and-consistency), read-your-writes consistency is not guaranteed when reading from replicas... I'm not sure the options to avoid stale re-reads.
- **[Bunny Storage](https://bunny.net/docs/storage)**.
- **Pay-as-you go**. Rather than Cloudflare's tiers.

Cons:

- **Slower cold start than Cloudflare**. ~10ms – 15ms avg with worst case ~25ms. Still pretty damn good.
- **Sveltekit SSR**? It's not clear to me whether Bunny.net would support Sveltekit SSR
- **S3 compatibility isn't GA**. As of Sept 22 2026, Bunny Storage's [S3-compatible API](https://bunny.net/docs/storage/s3) is in public preview. I may be willing to accept that if everything else works out.
- **Less localhost emulation**. Sounds like the TypeScript can be run locally under Node or Deno, but Storage, Database, the cache API and pull-zone behaviour are the real network or mocks.
- **Missing IaC surface area**? Bunny supplies their own Terraform provider, but it's new and may not cover everything we need. For example: can we mint the database token?
- **No DB backups**. Sounds like that hasn't arrived yet?
- **Less POPs than Cloudflare**. They have 120+ PoPs vs. Cloudflare’s 330+
- **Less secure than Cloudflare**. They lag Cloudflare on enterprise security tools: no Zero Trust or deep WAF

Cost:

| Bunny service  | Basis                                                | Per month |
| -------------- | ---------------------------------------------------- | --------: |
| Storage        | 152GB at $0.01/GB, one region                        |     $1.52 |
| CDN bandwidth  | 2.6GB                                                |     $0.03 |
| Edge Scripting | Minimum                                              |     $0.22 |
| Database       | Free in preview, then pennies at $0.10/GB per region |        $0 |
| Stream         | 1.7GB stored                                         |     $0.02 |
| Optimizer      | Flat per pull zone                                   |     $9.50 |
| **Total**      | About $2 without Optimizer                           |  **~$11** |

### ❌ REJECTED: Fastly

Fastly has the right edge-native architecture -- in fact I like their WASM-based edge function architecture better than Cloudflare's Chromium-based approach.

Pros:

- **Great edge compute**. Its Compute SDK supports TypeScript, compiled to WebAssembly, with local testing.
- **S3-compatible object storage**. Object Storage is S3-compatible and has no internal egress charge to Fastly delivery.
- **Image Optimizer** supports HEIC input, resizing, exact cropping, WebP and AVIF output. Image Optimizer reference
- **Terraform**. Compute, KV and object-storage credentials have Terraform resources.
- **DNS-friendly**. It does not require moving authoritative DNS; ordinary CNAME configuration works.

Cons:

- ❌ SHOWSTOPPER: **Unclear database story**. Fastly KV would work for materialized album JSON and version keys, but it is not a safe replacement for a relational source of truth: no multi-record transactions, relational queries, full-text search, or convincing backup/restore story. There's have to be another provider, like maybe Bunny Database (since we might also use Bunny Stream video transcoding). I doubt the complexity is worth it: if we're already relying on Bunny for database and video, seems much easier to use Bunny for everything.
- **Video story not as good as Bunny's**. Fastly delivers video but does not provide Bunny Stream–style self-service transcoding.
- **AVIF support may be too expensive**. AVIF encoding may require a premium entitlement despite the public pricing page advertising 100,000 free image requests.
- **Image Optimizer is beta**. Image Optimizer on Compute is still beta as of Sept 22 2026.

Cost:

| Fastly service  | Basis                                                                                  | Per month |
| --------------- | -------------------------------------------------------------------------------------- | --------: |
| CDN             | 2.6GB bandwidth and fewer than 1M requests, within the free allowances                 |        $0 |
| Compute         | Low-volume API, within 10M requests and 100M vCPU milliseconds free                    |        $0 |
| Object Storage  | 154GB across prod, staging and test, minus 5GB free, at $0.02/GB                       |     $2.98 |
| KV Store        | Metadata within the 1GB free allowance                                                 |        $0 |
| Image Optimizer | Fewer than 100,000 image requests; AVIF may require an unpriced Professional upgrade   |       $0+ |
| Video           | Fastly does not offer self-service video transcoding                                   |         — |
| Database/search | Fastly has no relational database or search service, so these require another provider |         — |
| **Total**       | Excludes database, search, video and any Image Optimizer upgrade                       |  **~$3+** |

### ❌ REJECTED: [Netlify](https://www.netlify.com/)

Pros:

- **Sveltekit support**. The official SvelteKit adapter can deploy the entire SSR application as a Deno-based Edge Function.
- **Image CDN** performs resizing, cropping and AVIF/WebP negotiation.
- **Good IaC**. It has netlify.toml, CLI/API management and a Terraform provider.

Cons:

- ❌ SHOWSTOPPER: **No video transcoding**. Would probably use Bunny instead. And if we're doing that, why not go all-in on Bunny?
- **HEIC input is not clearly supported by Image CDN**, so upload-time conversion probably remains necessary.
- ❌ SHOWSTOPPER: **The authoritative Postgres database is regional**; globally fast reads would require the Blob/CDN materialization architecture. That's complicated; why not instead use Cloudflare or Bunny with their edge databases.
- ❌ SHOWSTOPPER: **Standard and background Netlify Functions run on AWS Lambda**. I'd like to move off AWS.
- **Netlify Blobs** is more like a pull-through CDN cache rather than globally replicated object storage

Cost:

Personal costs $9/month with 1,000 credits. At our traffic levels, the 2.6 GB of web bandwidth would consume only about 52 credits.

### ❌ REJECTED: Vercel

Pros:

- **Developer experience**. Vercel has perhaps the best developer experience, and certainly know Sveltekit

Cons:

- **Slower**. By default, Vercel deploys SvelteKit serverless endpoints to a single primary region (e.g., iad1 in Virginia). When a user in Tokyo requests a server-rendered page or API endpoint, Vercel routes through their edge CDN, but the request still travels back to Virginia to run the SvelteKit code—instantly blowing past your 100ms budget.
- **More expensive**. They rent infrastructure from AWS/GCP/Fastly, so they're going to be more expensive.
- **No video support**. Would have to get that from a 3rd party.

### ❌ REJECTED: Google Cloud

GCP, like AWS, is mostly based on Regions. It sounds pretty complex to use their edge layer. Billing sounds opaque, complex, and susceptible to overages.

### ❌ REJECTED: Fly.io

The pro is that they have an edge architecture with lightweight micro-VMs around the world, which allows them to deploy any standard app including Postgres, but the nonstarter is that cold starts are too slow: 100ms–500ms.

### ❌ REJECTED: Render

The pro is that they have an edge architecture with lightweight micro-VMs around the world, which allows them to deploy any standard app including Postgres, but the nonstarter is that cold starts are too slow: 100ms–500ms.

### ❌ REJECTED: Gcore

Gcore has perhaps the closest media stack to Bunny — 210+ PoPs, edge functions, image optimization, object storage and excellent VOD transcoding — but the nonstarter is that its image-enabled CDN starts at €35/month, before solving the database.

### ❌ REJECTED: [Wasmer](https://wasmer.io/)

Pros:

- They have a super fast WebAssembly runtime, it's their claim to fame.

Cons:

- ❌ SHOWSTOPPER: Seed stage, I wouldn't call them viable.
- ❌ SHOWSTOPPER: It's regional edge compute, not a Cloudflare-style network with hundreds of execution PoPs. Wasmer currently documents six compute regions: Los Angeles, Oregon, Virginia, Québec, France, and Germany. Only Los Angeles, Québec, and France support databases and volumes; PostgreSQL is available only in Québec and France.
- The hosting is a company spun off from the WebAssembly company. I'd prefer a company that's global distribution first, runtime second.
