# eBay Auto-Lister — Store PENDING

Generates eBay CSV files from 1688 source product data,
then uploads them to eBay Seller Hub Reports via browser automation.

**Store ID**: PENDING — confirm after first login
**Pipeline status**: **ACTIVE** (started 2026-03-22)
**Main categories**: Watches, Fashion Jewelry, Accessories (Sunglasses, Hats, Bags, Hair, Scarves)

## Architecture

```
1688_source DB  →  [import-from-1688source: pull authorized products]
                →  ebay_autostore DB (local copy)
                →  [task1-csv-gen: generate CSV for Seller Hub Reports]
                →  output/ebay-export-YYYY-MM-DD.csv
                →  [task2-upload: Puppeteer → Seller Hub Reports upload]
                →  eBay listings live
```

- **Coding**: Main Computer (localhost)
- **Running**: local machine (see `config/china-macbook.env`) — `cd ~/projects/autostore/ebay`

## Database

Uses **two databases**:
- `1688_source` — read-only, shared with 1688_scrapper (source data)
- `ebay_autostore` — local copy of products for eBay pipeline

### ebay_autostore tables

| Table | Purpose |
|-------|---------|
| `products` | Core table: id_1688, status, category |
| `products_raw` | Chinese title, description, specs, CNY price |
| `products_en` | English title, description, specs, USD price |
| `products_images_ok` | Validated images (passed OCR check) |
| `product_variants` | Variant dimensions (Color, Size) |
| `variant_values` | Option values per dimension |
| `variant_skus` | SKU combinations with pricing |
| `platform_listings` | eBay item IDs after listing |

Status flow: `imported` → `csv_generated` → `ebay_exported` → `listed`

## Categories

eBay category mapping in `src/models/product.ts` → `EBAY_CATEGORY_MAP`.

Products are sourced from the **same 1688 pipeline as AliExpress**. Categories that overlap:
- Watches (quartz, couple, digital)
- Fashion Jewelry (earrings, bracelets, necklaces, rings)
- Sunglasses & Eyewear
- Hats & Caps
- Bags & Wallets
- Hair Accessories
- Scarves
- Belts & Gloves

Blue-ocean categories: `../rules/ebay-store/ebay-PENDING-blue-ocean-categories.md`

## CSV Format

eBay Seller Hub Reports accepts CSV files with these key columns:
- `Action` = ADD (new listing), REVISE (update), END (remove)
- `CustomLabel` = SKU (our 1688-{id_1688})
- `Category` = eBay leaf category ID
- `Title` = max 80 chars
- `ConditionID` = 1500 (New without tags) for most categories
- `StartPrice` = USD price
- `Format` = FixedPrice
- `Duration` = GTC (Good 'Til Cancelled)
- Variation support via `Relationship` + `RelationshipDetails` columns

## Pricing

eBay prices are in **USD** with higher markup than other platforms to account for ~15% total fees:
```
priceUsd = priceCny * 3.0 / 7.2
if priceUsd < 9.99 → raise to $9.99
```

Default markup: 3.0x. Min price: $9.99. eBay fees: ~13-15% total.

## Shipping Fee Strategy — MANDATORY

**Full reference: `../rules/ebay-store/EBAY_SHIPPING_FEE_STRATEGY.md`**

Two rules govern how every eBay listing handles shipping:

1. **Ship from China to US/Canada (primary markets)** — origin is always Guangdong/Shenzhen. US and Canada are our main destinations, but listings are configured ship-to: Worldwide via SpeedPAK Economy. Price with US/Canada as the reference market.
2. **Estimate shipping fees by competitor reference** — for every product, search eBay for similar weight/size products shipping from China to the US, note competitor shipping fees, set ours at a comparable or slightly lower price. Do not guess.

**Current default**: $5 first / $2 each additional on the SpeedPAK Free Shipping policy. Tuned for jewelry/small accessories. Adjust for heavier items based on competitor scan.

## CLI Commands

```bash
# Build
./node_modules/.bin/tsc          # NOT npx tsc

# Import from 1688_source
npm run task:import               # import 100 products
npm run task:import -- --limit 50
npm run task:import -- --category "quartz watches"
npm run task:import -- --dry-run

# Task 1 — Generate CSV
npm run task:csv                  # 50 products
npm run task:csv -- --limit 100
npm run task:csv -- --category "quartz watches"
npm run task:csv -- --regenerate  # re-export already-exported

# Task 2 — Upload to eBay
npm run task:login               # first-time: save cookies
npm run task:upload              # upload latest CSV
npm run task:upload -- --file output/ebay-export-2026-03-22.csv
```

## Full Pipeline (run on local machine)

```bash
cd ~/projects/autostore/ebay
git pull
./node_modules/.bin/tsc

# First time: login and save cookies
npm run task:login

# Import authorized products from 1688_source
npm run task:import -- --limit 10

# Generate CSV
npm run task:csv -- --limit 10

# Upload to eBay Seller Hub
npm run task:upload
```

## New Seller Limits

eBay starts new sellers at **10 items / $500**. Limits increase automatically with good performance.
Start small, build reputation, then scale.

## eBay Sourcing Strategy — DEMAND FIRST (MANDATORY)

**Full doc: `../rules/ebay-store/EBAY_SOURCING_STRATEGY.md`**

**The rule**: Find what sells on eBay → find the 1688 source → list it. Never start from supply.

1. Search eBay for a category → filter **Sold Items + New** → study top results (title keywords, price, sales count, image style)
2. Find a matching product on 1688.com at a price that gives 3x+ markup
3. List it, modelling the title/price/image after the proven eBay seller

**Do NOT list a product just because it's available in 1688 — always verify eBay demand first.**

**Brand rule for eBay**: Remove only very famous brands (Nike, Gucci, Louis Vuitton, Apple, Samsung, Sony, Rolex, etc.) — everything else is OK. Any non-famous-brand product in any category is fair game as long as it sells well on eBay with 3x+ markup available.

**NOT restricted to brand-safe categories**: The brand-safe category restriction (Phase 1, 108 categories) applies ONLY to the automated Task 1 pipeline discovery. Manual eBay sourcing is allowed across ALL categories — watches, bags, shoes, finished jewelry, etc. — as long as very famous brands are removed.

## Greater China Seller Account Constraints — MANDATORY

**Full reference: `../rules/ebay-store/EBAY_GREATER_CHINA_SELLER_CONSTRAINTS.md`**

These constraints apply to any AutoStore eBay account registered as a Greater China seller without a dedicated account manager (i.e. all our current accounts). Read the full doc before making any shipping policy changes or testing new categories.

**Critical highlights:**

1. **SpeedPAK-only shipping** — only `eBay SpeedPAK Standard` and `eBay SpeedPAK Economy` are allowed. Non-SpeedPAK services (e.g. "Economy Shipping from Greater China to worldwide") are BLOCKED. Bulk policy updates that include a disallowed service fail with a misleading "improper words" error.
2. **High-risk categories BLOCKED**: Hair Accessories (cat 45220), Unisex Sunglasses (155189), Men's Sunglasses (79720). Test-list ONE product before filling an entire form.
3. **Visual brand inspection required** — always look at actual product images, not just titles. 1688 titles like "European and American Trendy Brand" often hide Gucci/LV/etc monograms in the images.
4. **Default excluded countries**: Russia, Ukraine (account-level, cannot remove).
5. **Recommended shipping policy**: Domestic SpeedPAK Standard (free) + International SpeedPAK Economy ($5 first / $2 each additional, Worldwide).
6. **Bulk policy update fallback pattern** — if a policy update fails, listings get auto-reassigned to a "Copy" of the policy with previous settings. Fix the root cause, then bulk re-assign listings to the fixed original policy via Seller Hub → Active listings → Edit → Shipping policy.

## Critical Rules

- **NEVER list branded products** — eBay VeRO program is aggressive
- **`isBannedBrand()` runs on every product** before CSV generation
- **Only `authorized_products` are imported** — brand-verified via Task 8
- **Max 80 chars for title** — eBay strictly enforces this
- **Main Computer = coding only** — never run tasks here
- **local machine = running only** — pull, build, execute
- **Build with `./node_modules/.bin/tsc`** — NOT `npx tsc`
- **Cookies file** is at `data/ebay-cookies.json` — do not commit to git

## File Structure

```
ebay/
  src/
    config.ts              — env config
    models/product.ts      — EBAY_CATEGORY_MAP, product types
    csv/
      column-mapping.ts    — CSV columns for Seller Hub Reports
      csv-generator.ts     — CSV file generator
    tasks/
      import-from-1688source.ts — import products from 1688_source
      task1-csv-gen.ts     — CLI: generate CSV from DB
      task2-upload.ts      — CLI: upload CSV to eBay Seller Hub
    database/
      db.ts                — MySQL pool, schema init, upsertPlatformListing
      repositories.ts      — product queries
    utils/
      helpers.ts           — isBannedBrand, escapeCSV, pricing
      logger.ts            — winston logger
  output/                  — generated CSV files (ebay-export-*.csv)
  data/                    — chrome profile + cookies (gitignored)
  logs/                    — browser screenshots + debug logs
```
