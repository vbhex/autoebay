# eBay Session Handoff — 2026-04-18

This document captures everything learned and completed during the 2026-04-15 → 2026-04-18 eBay listing sessions so a new Claude session can pick up seamlessly.

---

## 2026-04-19 Session — Rule Update + Pipeline Queue Inspection

### Root-level rule added (autostore/CLAUDE.md)
**NEVER VISIT 1688.COM FROM THE MAIN COMPUTER.** All 1688 access (incl. s.1688.com, detail.1688.com, login.1688.com) must happen only from the China MacBook. Main Computer IP is outside the China firewall → login walls/captchas/degraded content. If China MacBook unreachable: stop and write to `HandOff.md`. Applies to ALL AutoStore projects.

### eBay demand research done (Main Computer eBay.com)
Target: **category 261993 Fine Jewelry Necklaces & Pendants**.
Top signal: **925 Sterling Silver Zodiac Pendant Necklace** (12 zodiac signs = 12 natural variants). eBay sold example at ~$37 USD, high-feedback seller. Evergreen gift demand. Full zodiac task in root `/HandOff.md`.

Also solid demand seen: sterling silver beaded/heart/extender chains from China sellers, all sold today (Apr 19).

### Pipeline queue state (`ebay_autostore` DB, China MacBook)
- 37 live listings tracked as `status=listed`
- **11 products imported and ready-to-list**:
  - TieChains (9): mostly silk ties / tie-knot necklaces
  - BodyChain (2): one has "Agete" red-flag, one is a weapon-style "defense belt" (skip)
- 30 sunglasses `csv_generated` — sit idle (cat 79720 blocked for Greater China accounts)
- 3 hair accessories `list_failed` — confirms cat 45220 blocked

### Image-verified listing shortlist (inspected via alicdn.com CDN)
| 1688 ID | Title | Price | Note |
|---------|-------|-------|------|
| 905544862239 | Golden Super Long Tassel Long Chain | $12.00 | 🟢 Clean — woven gold choker with tassels, no brand marks. Relist as eBay cat **155101** Fashion Necklaces (not Men's Ties — it's a women's choker/scarf-chain). |
| 651151325223 | Silk tie men's striped gift box | $21.90 | 🟢 Clean — classic business striped ties, 10+ color variants. eBay cat **15662** Men's Ties. |
| 995680166333 | Trendy Denim Tie | $16.00 | 🟡 Niche punk/y2k aesthetic — hold for later |
| 800761422780 | — | $14.60 | 🔴 Skip — "EVANHOME" / 艾梵之家 branded watermark on photos |
| 737125596972 | Japanese Style **Agete** Tears | $18.20 | 🔴 Skip — "Agete" red-flag phrase |
| 668862112655 | **Defense Belt** | $23.10 | 🔴 Skip — weapon category, wrong fit |
| 852507793778 / 1042349849824 / 861925377182 / 963017163104 / 847745251800 | Various European/Empress/Trendy Brand ties | — | 🔴 Skip — red-flag title phrases, need image re-inspection before listing |

### Resume-listing steps (next session)
1. Open https://www.ebay.com/sh/lst/active → click **"Sell similar"** on an existing body-chain listing (preserves SpeedPAK Free Shipping policy, 10-day handling, payment + return policies)
2. For **905544862239** (Golden Tassel):
   - Title: `Women Gold Woven Mesh Tassel Long Chain Choker Necklace Fashion Jewelry Gift` (under 80 chars)
   - Category: **155101** Fashion Necklaces & Pendants
   - Condition: 1500 New without tags
   - Price: **$12.00** (priceCny * 3.0 / 7.2, floor $9.99)
   - Qty: **3**
   - Images: from `ebay_autostore.products_images_ok WHERE product_id = (SELECT id FROM products WHERE id_1688='905544862239')` — 6+ gallery images ready
   - Ship-to: Worldwide (account excludes Russia/Ukraine by default)
3. For **651151325223** (Silk Ties):
   - Title: `Men Classic Striped Silk Tie Business Formal Wedding Gift Box 10 Colors` (under 80)
   - Category: **15662** Men's Ties
   - Price: **$21.90**
   - Qty: **3**
   - Variants: 10+ color variants available in 1688 source — if eBay allows variants in this category, list as single multi-variant listing; else list top 3–5 colors separately
4. After publish, log each to `ebay/logs/listed-items.log` in existing format and update `ebay_autostore.products.status` → `listed`, plus insert into `platform_listings(product_id, platform='ebay', platform_product_id=<eBay item ID>)`.

### Plan B (zodiac pendant discovery) — deferred to China MacBook Claude session
See root `HandOff.md` for full task spec (eBay keywords, 1688 search terms, pipeline import, listing template). Do NOT run from Main Computer.

**Note**: During this session, an accidental Task 1 run was triggered on China MacBook (the `--help` flag is not recognized by task1-discover and it started a full 232-category discovery). It was killed before processing any products — only the handkerchief category briefly hit a captcha wall. No state pollution.

### Still pending for user (unchanged from 2026-04-18)
- Ship the 2 existing orders (Apr 16 + Apr 17) by **Apr 21** via any China courier + manually add tracking in Seller Hub
- Confirm long-term SpeedPAK portal access path (gcx.ebay.com and orangeconnex.com blocked for user — may need CPaSS registration or alternate courier integration)

---

## 2026-04-18 Session — Shipping Label Diagnosis + Handling Time Policy Cleanup

### Context
User received 2 new orders (Apr 16 & Apr 17) with "Ship by Apr 21" deadlines. Tried to buy an eBay shipping label for the Apr 16 order (Raquel Ortega, Arleta CA, pearl necklace, SpeedPAK Standard) and got error:

> "Your ship from address must be in the United States to purchase a label."

### Key Finding — eBay Shipping Labels Are US-Only
Greater China sellers CANNOT use eBay's "Buy shipping label" button. It requires a US ship-from address.

**Correct fulfillment path for our account**: Orange Connex / SpeedPAK via eBay CPaSS portal at:
- https://export.ebay.com/en/ebay-speedpak/

Sellers link their eBay account to CPaSS, then fulfill SpeedPAK orders through the Orange Connex seller portal (NOT through orangeconnex.com directly — that's blocked/irrelevant from China-facing flows).

### Rule 7 — Handling Time Minimum 10 Business Days (NEW)
China → US SpeedPAK Economy takes 6–15 business days. A 2-day handling time + SpeedPAK transit made Apr 21 deadlines nearly impossible.

**Changed default handling time 2 → 10 business days** on all shipping policies.

eBay handling time is a discrete dropdown: 1 / 2 / 3 / 4 / 5 / 6 / 7 / 10 / 15 / 20 / 30 business days. No ranges allowed. 10 is the right balance for ship-from-China.

### Shipping Policy Cleanup
Before: 4 shipping policies (confusing, many unused).
After: **1 shipping policy** — `SpeedPAK Free Shipping` (43 listings, 10 business days handling).

Policies updated to 10 business days handling, then deleted if unused:
- `SpeedPAK Free Shipping` (278032309018) — kept, all 43 listings
- `Free Shipping Via China Post` (276047959018) — deleted
- `Free Shipping Via China Post2` (276048128018) — deleted
- `SpeedPAK Free Shipping Copy` (278189624018) — deleted (auto-created during Apr 17 bulk-update fallback)

Note: eBay only auto-deletes policies inactive for 30+ days. Manual delete via action menu (three-dot) → Delete → confirm.

### Accomplishments
1. ✅ Diagnosed Apr 16 order shipping-label error (US-only ship-from)
2. ✅ Documented Orange Connex / CPaSS fulfillment path
3. ✅ Changed handling time 2 → 10 business days on active shipping policy (all 43 listings)
4. ✅ Cleaned up 3 unused shipping policies

### Pending for user
1. [ ] Ship the 2 existing orders (Apr 16 + Apr 17) by Apr 21 via Orange Connex
2. [ ] Link eBay account to CPaSS at https://export.ebay.com/en/ebay-speedpak/ if not already done
3. [ ] Confirm future orders flow through SpeedPAK portal (labels + tracking auto-sync to eBay)

---

## Quick Orientation

- **Store**: AutoStore eBay seller account (handle in `$EBAY_SELLER_HANDLE` env var)
- **Registration**: Greater China seller, NO dedicated account manager
- **Total listings live**: 38 (as logged in `logs/listed-items.log`)
- **Approximate total across platform at session end**: 43 listings (some pre-existed before this session series)
- **Platform strategy**: demand-first, remove-famous-brands-only (NOT brand-safe category restricted)
- **Browser**: ALWAYS use `mcp__Claude_in_Chrome__*` tools — NEVER Puppeteer

---

## Canonical Rule Documents (READ FIRST before listing)

All new rules discovered this session are documented permanently. Read these before listing any product:

| Document | Purpose |
|----------|---------|
| `../documents/ebay-store/EBAY_GREATER_CHINA_SELLER_CONSTRAINTS.md` | 6 operational rules for Greater China sellers (SpeedPAK, categories, brand check, etc.) |
| `../documents/ebay-store/EBAY_SHIPPING_FEE_STRATEGY.md` | Ship-from-China + competitor-fee-benchmarking rules |
| `ebay/CLAUDE.md` | Project-level summary referencing both docs above |
| `~/.claude/projects/-Users-jameswalstonn-Documents-autostore-ebay/memory/feedback_ebay_speedpak_only.md` | SpeedPAK-only constraint (session memory) |
| `~/.claude/projects/-Users-jameswalstonn-Documents-autostore-ebay/memory/feedback_ebay_high_risk_categories.md` | Blocked + working category list |
| `~/.claude/projects/-Users-jameswalstonn-Documents-autostore-ebay/memory/feedback_ebay_inspect_images_for_brands.md` | Visual brand inspection workflow |

---

## Critical Rules Discovered This Session

### Rule 1 — SpeedPAK-Only Shipping

Greater China accounts can ONLY use:
- `eBay SpeedPAK Standard` (5–12 business days)
- `eBay SpeedPAK Economy` (6–15 business days)

Everything else (Economy Shipping from Greater China, DHL/FedEx/UPS direct, etc.) is BLOCKED.

**Misleading error**: When bulk updating a policy with a disallowed service, eBay returns:
> "The item cannot be listed or modified. The title and/or description may contain improper words, or the listing or seller may be in violation of eBay policy."

This is NOT a content moderation issue — it's a disallowed shipping service. Always check service name first.

### Rule 2 — High-Risk Categories BLOCKED

| Cat ID | Name | Notes |
|--------|------|-------|
| 45220 | Hair Accessories | all sub-types blocked |
| 155189 | Unisex Sunglasses | blocked |
| 79720 | Men's Sunglasses | all sunglass subs appear blocked |

### Confirmed WORKING categories

| Cat ID | Name |
|--------|------|
| 155101 | Fashion Necklaces & Pendants |
| 167902 | Handkerchiefs & Pocket Squares |
| 261986 | Body Jewelry |
| 50647 | Fashion Earrings |
| 261993 | Necklaces & Pendants (Fine Jewelry) |
| 15662 | Men's Ties (HIGH counterfeit risk — always inspect images) |

### Rule 3 — Visual Brand Inspection (Image Check)

`isBannedBrand()` title check is NOT sufficient. 1688 supplier titles hide famous-brand counterfeits behind vague phrases.

**Red-flag title phrases:**
- "European and American [Trendy/Big/Famous] Brand"
- "High-End Version of [vague name]"
- "Phantom" / "Original Business" / "Authentic Style"
- "Empress / Empress Dowager"
- "Gracia" / "Lola" / "Agete"

**Concrete case from this session**: Product 78 had clean title "European and American Trendy Brand Silk Tie..." but images showed visible Gucci GG monogram and Gucci-green packaging. Aborted listing.

**Workflow**: Always query `products_images_ok.image_url` and visually inspect main + secondary images before filling the listing form.

### Rule 4 — Default Excluded Countries

Account-level: Russia, Ukraine (cannot remove from individual listings).

### Rule 5 — Bulk Policy Update Fallback Pattern

When updating a shipping policy that is bound to listings:
1. Policy entity saves successfully.
2. eBay tries to apply to bound listings.
3. If ANY listing rejects the new service → ALL listings get reassigned to an auto-generated "Copy" of the policy with PREVIOUS settings.
4. Original policy shows "Errors found" / 0 listings.
5. Listings continue working on the old Copy.

**Recovery**:
1. Fix root cause (switch to SpeedPAK).
2. Seller Hub → Listings → Active → bulk select all.
3. Edit → Bulk edit → Shipping policy → "Change to" → pick fixed original.
4. Submit. Bulk revise succeeds.

### Rule 6 — Shipping Fee Strategy

1. **Ship from China to US/Canada** — Guangdong/Shenzhen origin; US + Canada are primary destinations. Ship-to: Worldwide via SpeedPAK Economy.
2. **Estimate fees via competitor reference** — Search eBay for similar weight/size products shipping from China to US, set fees at comparable or slightly lower price. Do not guess.

**Current default** (as of 2026-04-17): $3 first / $1 each additional on SpeedPAK Free Shipping policy. Tuned for small jewelry. Competitor scan data:
- Small jewelry (pendants, earrings) from China: FREE
- Body chains / waist chains: $7.58–$18.94

---

## Current Active Listings (38 logged + ~5 legacy)

Full log at `ebay/logs/listed-items.log`. Summary:

| Date | Count | Categories |
|------|-------|------------|
| 2026-04-15 | 16 | Necklaces (155101), Handkerchiefs/Ties (167902) |
| 2026-04-16 | 12 | Body Jewelry (261986), Fine Jewelry (261993), Necklaces (155101) |
| 2026-04-17 | 10 | Fine Jewelry (261993), Necklaces (155101), Men's Ties (15662) |

Price range: $9.99 – $55.80. All shipping policy = "SpeedPAK Free Shipping" (domestic free SpeedPAK Standard + international $3/$1 SpeedPAK Economy Worldwide).

---

## Session Accomplishments

1. ✅ Listed products 68, 69, 70, 71, 57, 79 (plus ties, body chains, necklaces throughout)
2. ✅ Tested & confirmed Men's Sunglasses cat 79720 BLOCKED (aborted 30 sunglasses listings)
3. ✅ Caught Gucci GG monogram on product 78 via image inspection (aborted)
4. ✅ Diagnosed SpeedPAK-only constraint (bulk policy update failed with 40 listings)
5. ✅ Created worldwide shipping policy via SpeedPAK Economy
6. ✅ Bulk re-assigned all 43 listings to the fixed SpeedPAK Free Shipping policy
7. ✅ Verified worldwide availability on listing 287277077314 (US = free SpeedPAK Standard, international = $3 SpeedPAK Economy)
8. ✅ Lowered shipping fees from $5/$2 → $3/$1 based on competitor scan
9. ✅ Documented ALL discovered rules:
   - 3 session memory files
   - 1 canonical `EBAY_GREATER_CHINA_SELLER_CONSTRAINTS.md`
   - 1 canonical `EBAY_SHIPPING_FEE_STRATEGY.md`
   - Updated `ebay/CLAUDE.md` to reference both
10. ✅ Committed shipping strategy update (`4a55fd1`)

---

## Outstanding / Pending

### User's last message (no image analyzed yet)

The user sent an image with caption **"how to fix this issue."** at the very end of the previous session. The image was not analyzed before compaction. When resuming:

1. Ask the user to either re-attach the image OR describe what's shown.
2. Likely candidates based on session context:
   - A listing error after the $3/$1 shipping update
   - A bulk propagation failure (similar to earlier "improper words")
   - A Seller Hub warning (item disclosures, EU/UK safety, etc.)
   - A specific listing showing unexpected shipping/price
3. Start by viewing current Seller Hub state via `mcp__Claude_in_Chrome__*` if user wants a walkthrough.

---

## Environment & Commands Cheat Sheet

### Build

```bash
cd /Users/jameswalstonn/Documents/autostore/ebay
./node_modules/.bin/tsc        # NOT npx tsc
```

### China MacBook SSH (if running pipeline tasks)

```bash
source /Users/jameswalstonn/Documents/autostore/config/china-macbook.env
sshpass -p "$CHINA_MACBOOK_PASSWORD" ssh \
  -o PreferredAuthentications=password -o PubkeyAuthentication=no \
  "$CHINA_MACBOOK_USER@$CHINA_MACBOOK_IP"
```

MySQL on China MacBook: user `root`, password `52Tiananmen`, DB `ebay_autostore` (NEVER write to `1688_source` — reserved for AutoStore Mac client).

### Browser

ALWAYS use `mcp__Claude_in_Chrome__*` tools. Never Puppeteer. Log in once, cookies persist across session.

---

## Pricing Formula (REMINDER)

```
priceUsd = priceCny * 3.0 / 7.2
if priceUsd < 9.99 → $9.99
```

QTY: 3 per listing (new seller monthly limit).

---

## Banned Brands Quick-Check (Visual)

Nike · Gucci (GG, green/red stripes) · LV (monogram, Damier) · Burberry (Nova plaid) · Chanel (CC) · Hermès (H, orange box) · Dior (CD oblique, cannage) · Tiffany & Co (TF, Tiffany Blue) · Apple · Samsung · Sony · Rolex (crown) · Ferrari · Lamborghini

---

## Key File Paths

```
/Users/jameswalstonn/Documents/autostore/
├── ebay/
│   ├── CLAUDE.md                         ← project rules (just updated)
│   ├── HANDOFF.md                        ← THIS FILE
│   ├── logs/listed-items.log             ← listing log (append-only)
│   └── src/...                           ← TypeScript code
│
├── documents/ebay-store/
│   ├── EBAY_GREATER_CHINA_SELLER_CONSTRAINTS.md  ← canonical rules doc
│   ├── EBAY_SHIPPING_FEE_STRATEGY.md             ← ship-from-China + fee estimation
│   └── EBAY_SOURCING_STRATEGY.md                 ← demand-first playbook (older)
│
└── config/china-macbook.env                       ← SSH creds for pipeline

/Users/jameswalstonn/.claude/projects/-Users-jameswalstonn-Documents-autostore-ebay/memory/
├── MEMORY.md                                      ← index
├── feedback_ebay_speedpak_only.md
├── feedback_ebay_high_risk_categories.md
├── feedback_ebay_inspect_images_for_brands.md
├── feedback_browser_preference.md
├── feedback_ebay_sourcing_rule.md
├── project_db_isolation.md
└── project_pipeline_status.md
```

---

## Resumption Checklist for Next Session

1. [ ] Read this HANDOFF.md
2. [ ] Read `ebay/CLAUDE.md` for project rules
3. [ ] Read `../documents/ebay-store/EBAY_GREATER_CHINA_SELLER_CONSTRAINTS.md`
4. [ ] Read `../documents/ebay-store/EBAY_SHIPPING_FEE_STRATEGY.md`
5. [ ] Ask user to re-attach or describe the image from their last message ("how to fix this issue")
6. [ ] If continuing listings: follow demand-first → 1688 source → brand-check (title + images) → list flow
7. [ ] Never use Puppeteer; always `mcp__Claude_in_Chrome__*`
8. [ ] Never list in high-risk categories (45220, 155189, 79720)
9. [ ] Never use non-SpeedPAK shipping services
10. [ ] Always inspect product images before listing (not just title)

---

**Last session ended**: 2026-04-17, waiting on user's "how to fix this issue" image.
