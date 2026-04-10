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

Blue-ocean categories: `documents/ebay-store/ebay-PENDING-blue-ocean-categories.md`

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
