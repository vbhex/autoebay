/**
 * eBay CSV generator for Seller Hub Reports bulk upload.
 *
 * Output format matches the official "fx_category_template_EBAY_US" template:
 *   Line 0:  Info,Version=1.0.0,Template=fx_category_template_EBAY_US
 *   Line 1:  96-column header
 *   Lines 2-4: empty rows
 *   Line 5:  Info,>>> help link
 *   Lines 6+: data rows
 *
 * File encoding: UTF-8 with BOM (0xEF 0xBB 0xBF), CRLF line endings.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists, isBannedBrand, truncateToBytes, roundPrice, escapeCSV } from '../utils/helpers';
import {
  COLUMN_COUNT, COL_IDX, emptyRow, getHeaderRow,
  INFO_LINE, HELP_LINE,
} from './column-mapping';
import { ExportProduct, EBAY_CATEGORY_MAP, EbayCategoryInfo } from '../models/product';

const logger = createChildLogger('csv-generator');

const CRLF = '\r\n';
const UTF8_BOM = '\uFEFF'; // JS string BOM — written as 0xEF 0xBB 0xBF in UTF-8
const CNY_TO_USD = 7.2;

// ─── Pricing ──────────────────────────────────────────────────────────────────

function calculatePriceUsd(priceCny: number, priceUsdFromDb: number): number {
  const markup = config.pricing.markup;
  let price: number;

  if (priceCny > 0) {
    price = (priceCny * markup) / CNY_TO_USD;
  } else if (priceUsdFromDb > 0) {
    price = priceUsdFromDb * markup;
  } else {
    price = config.pricing.minRetailPriceUsd;
  }

  if (price < config.pricing.minRetailPriceUsd) {
    price = config.pricing.minRetailPriceUsd;
  }

  return roundPrice(price);
}

// ─── Title sanitizer ─────────────────────────────────────────────────────────
// eBay error 240: prohibited medical/health terms in listings.
// Strip or replace terms that trigger eBay's improper-words filter.
const PROHIBITED_TITLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bmyopia\b/gi, ''],
  [/\bshort[\s-]?sighted(?:ness)?\b/gi, ''],
  [/\bnear[\s-]?sighted(?:ness)?\b/gi, ''],
  [/\bpresbyopi[ac]\b/gi, ''],
  [/\bastigmat(?:ism|ic)\b/gi, ''],
  [/\bhyperopi[ac]\b/gi, ''],
  [/\bfarsighted(?:ness)?\b/gi, ''],
  [/\blongsighted(?:ness)?\b/gi, ''],
  [/\b(?:for|treat(?:ing)?|correct(?:ing)?)\s+(?:vision|eyesight)\b/gi, ''],
  [/\s{2,}/g, ' '],   // collapse double spaces left by removals
];

function sanitizeTitle(raw: string): string {
  let t = raw;
  for (const [pattern, replacement] of PROHIBITED_TITLE_PATTERNS) {
    t = t.replace(pattern, replacement);
  }
  return t.trim();
}

// ─── Description builder ──────────────────────────────────────────────────────

function buildDescription(
  title: string,
  specs: Array<{ name: string; value: string }>,
): string {
  const lines: string[] = [];
  lines.push(`<h2>${escapeHTML(title)}</h2>`);

  if (specs.length > 0) {
    lines.push('<h3>Specifications</h3>');
    lines.push('<ul>');
    for (const spec of specs) {
      if (spec.name && spec.value) {
        lines.push(`<li><strong>${escapeHTML(spec.name)}</strong>: ${escapeHTML(spec.value)}</li>`);
      }
    }
    lines.push('</ul>');
  }

  lines.push('<h3>Notes</h3>');
  lines.push('<ul>');
  lines.push('<li>Brand new, high quality</li>');
  lines.push('<li>Ships from China via economy international shipping</li>');
  lines.push('<li>Estimated delivery: 15-30 business days</li>');
  lines.push('<li>30-day return policy</li>');
  lines.push('</ul>');

  // eBay requires single-line HTML — no literal newlines in CSV cells
  return lines.join('');
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Variant helpers ──────────────────────────────────────────────────────────

const COLOR_WORDS = ['color', 'colour', '颜色', 'clr'];
const SIZE_WORDS = ['size', '尺寸', '大小', '型号', 'sz'];

function isColorKey(key: string): boolean {
  const k = key.toLowerCase();
  return COLOR_WORDS.some(w => k.includes(w));
}

function isSizeKey(key: string): boolean {
  const k = key.toLowerCase();
  return SIZE_WORDS.some(w => k.includes(w));
}

function cleanVariantValue(raw: string): string {
  if (!raw) return raw;
  let name = raw.trim();

  const bracketMatch = name.match(/^\[([^\]]+)\]/);
  if (bracketMatch) {
    name = bracketMatch[1].replace(/\s*-\s*/g, ' ').trim();
  } else {
    const parts = name.split(/[丨|]/).map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length >= 2) {
      name = parts[1];
    }
  }

  if (name.length > 50) name = name.substring(0, 50).trim();
  return name || raw.substring(0, 50);
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface CSVResult {
  filePath: string;
  productCount: number;
  rowCount: number;
  categories: string[];
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateCSV(products: ExportProduct[]): Promise<CSVResult | null> {
  // ── Brand filter ────────────────────────────────────────────────────────────
  const filtered: ExportProduct[] = [];

  for (const prod of products) {
    if (isBannedBrand(prod.en.titleEn)) {
      logger.warn('isBannedBrand check failed', { title: prod.en.titleEn.substring(0, 60) });
      continue;
    }
    filtered.push(prod);
  }

  if (filtered.length === 0) {
    logger.info('No products to export after brand filtering');
    return null;
  }

  ensureDirectoryExists(config.paths.output);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `ebay-export-${dateStr}.csv`;
  const filePath = path.join(config.paths.output, filename);

  // ── Build data rows ─────────────────────────────────────────────────────────
  const dataRows: string[][] = [];
  let totalDataRows = 0;
  const categoriesUsed = new Set<string>();

  for (const prod of filtered) {
    const catInfo = EBAY_CATEGORY_MAP[prod.category];
    if (!catInfo) {
      logger.warn('No eBay category mapping, skipping', { category: prod.category });
      continue;
    }

    const galleryImages = prod.images
      .filter(img => img.imageType === 'gallery')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (galleryImages.length === 0) {
      logger.debug('Skipping product with no gallery images', { id1688: prod.id1688 });
      continue;
    }

    const en = prod.en;
    const basePrice = calculatePriceUsd(prod.priceCny, en.priceUsd);
    const description = buildDescription(en.titleEn, en.specificationsEn);
    const title = truncateToBytes(sanitizeTitle(en.titleEn), 80);
    const baseSku = `1688-${prod.id1688}`;

    categoriesUsed.add(prod.category);

    const hasVariants =
      prod.skus && prod.skus.length > 1 &&
      prod.variantStructure && prod.variantStructure.length > 0;

    if (hasVariants) {
      // ── Build child rows first so we can aggregate values for parent ──────
      const variantMap = buildVariantMap(prod);
      const childRows: string[][] = [];
      const allColors = new Set<string>();
      const allSizes  = new Set<string>();

      for (const sku of prod.skus!) {
        if (!sku.available) continue;

        const childSku = `${baseSku}-${sku.id}`;
        const childPrice = calculatePriceUsd(sku.priceCny || prod.priceCny, en.priceUsd);
        const relationDetails = buildRelationDetails(sku.variantValuesJson, variantMap);
        const variantValues = parseRelationDetails(relationDetails);

        const childRow = buildRow(prod, catInfo, {
          sku: childSku,
          title,
          description: '',         // description only on parent
          price: childPrice,
          galleryImages: [],       // images only on parent
          isParent: false,
        });

        childRow[COL_IDX['Relationship']] = 'Variation';
        childRow[COL_IDX['RelationshipDetails']] = relationDetails;

        // Only Color and Size are valid eBay variation dimensions.
        // CRITICAL: buildRow() sets fallback *C:Color='Multicolor' and *C:Size='One Size'.
        // For variation child rows, eBay treats any value in *C:Color/*C:Size as a variation axis.
        // We MUST clear the dimensions that are not actual variation axes for this specific SKU.
        if (variantValues.Color) {
          childRow[COL_IDX['*C:Color']] = variantValues.Color;
          allColors.add(variantValues.Color);
        } else {
          childRow[COL_IDX['*C:Color']] = ''; // clear fallback 'Multicolor'
        }
        if (variantValues.Size) {
          childRow[COL_IDX['*C:Size']] = variantValues.Size;
          allSizes.add(variantValues.Size);
        } else {
          childRow[COL_IDX['*C:Size']] = ''; // clear fallback 'One Size' — not a variation axis
        }
        // Style is NOT a variation dimension — it stays as a fixed item specific from catInfo

        if (sku.imageUrl) {
          childRow[COL_IDX['PicURL']] = sku.imageUrl;
        }

        childRows.push(childRow);
      }

      if (childRows.length === 0) continue; // skip if no available SKUs

      // ── Parent row — aggregate all child variant values ───────────────────
      const parentRow = buildRow(prod, catInfo, {
        sku: baseSku,
        title,
        description,
        price: 0,
        galleryImages,
        isParent: true,
      });

      // ── Parent RelationshipDetails: defines the VariationSpecificsSet ────────
      // eBay requires the parent to declare ALL variation dimensions and all their
      // possible values in RelationshipDetails using this format:
      //   "Color=Red;Blue;Green|Size=S;M;L"  (semicolons between values, pipes between dims)
      // The child rows use:
      //   "Color=Blue|Size=M"  (one value per dim, pipe between dims)
      // Without this parent declaration, eBay returns error 21916587.
      const parentRelDetParts: string[] = [];
      if (allColors.size > 0) parentRelDetParts.push(`Color=${[...allColors].join(';')}`);
      if (allSizes.size  > 0) parentRelDetParts.push(`Size=${[...allSizes].join(';')}`);
      if (parentRelDetParts.length > 0) {
        parentRow[COL_IDX['RelationshipDetails']] = parentRelDetParts.join('|');
      }

      // C:Color / C:Size on the parent row = pipe-separated list of ALL values (eBay display).
      // Style is NOT a variation dimension — parent's C:Style stays as the catInfo value.
      //
      // CRITICAL: buildRow() sets fallback *C:Color='Multicolor' and *C:Size='One Size'.
      // For variation parents, eBay treats any pipe-separated or single value in *C:Color/*C:Size
      // as variation dimensions — so we MUST clear dimensions that are not actual variation axes.
      // If allSizes is empty, children don't have Size= in RelationshipDetails → clear *C:Size.
      if (allColors.size > 0) {
        parentRow[COL_IDX['*C:Color']] = [...allColors].join('|');
      } else {
        parentRow[COL_IDX['*C:Color']] = ''; // clear the fallback 'Multicolor'
      }
      if (allSizes.size > 0) {
        parentRow[COL_IDX['*C:Size']] = [...allSizes].join('|');
      } else {
        parentRow[COL_IDX['*C:Size']] = ''; // clear the fallback 'One Size' — not a variation axis
      }

      dataRows.push(parentRow);
      totalDataRows++;
      for (const cr of childRows) { dataRows.push(cr); totalDataRows++; }
    } else {
      // ── Standalone listing (no variations) ───────────────────────────────
      const row = buildRow(prod, catInfo, {
        sku: baseSku,
        title,
        description,
        price: basePrice,
        galleryImages,
        isParent: false,
      });
      dataRows.push(row);
      totalDataRows++;
    }
  }

  if (totalDataRows === 0) {
    logger.info('No rows generated');
    return null;
  }

  // ── Assemble the file ───────────────────────────────────────────────────────
  const parts: string[] = [];

  // Line 0: metadata
  parts.push(INFO_LINE);

  // Line 1: 96-column header
  parts.push(getHeaderRow().map(escapeCSV).join(','));

  // Lines 2-4: three truly empty rows (eBay template format — no commas)
  parts.push('');
  parts.push('');
  parts.push('');

  // Line 5: help link
  parts.push(HELP_LINE);

  // Data rows
  for (const row of dataRows) {
    parts.push(row.map(escapeCSV).join(','));
  }

  // Join with CRLF and write with UTF-8 BOM
  const csvContent = UTF8_BOM + parts.join(CRLF) + CRLF;
  fs.writeFileSync(filePath, csvContent, 'utf-8');

  logger.info('eBay CSV written', {
    filePath,
    products: filtered.length,
    rows: totalDataRows,
    categories: Array.from(categoriesUsed),
  });

  return {
    filePath,
    productCount: filtered.length,
    rowCount: totalDataRows,
    categories: Array.from(categoriesUsed),
  };
}

// ─── Row builders ─────────────────────────────────────────────────────────────

interface RowOpts {
  sku: string;
  title: string;
  description: string;
  price: number;
  galleryImages: Array<{ imageUrl: string }>;
  isParent: boolean;
}

function buildRow(
  prod: ExportProduct,
  catInfo: EbayCategoryInfo,
  opts: RowOpts,
): string[] {
  const row = emptyRow(); // 96 empty strings

  // ── Core fields ─────────────────────────────────────────────────────────────
  row[COL_IDX['*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)']] = 'Add';
  row[COL_IDX['CustomLabel']] = opts.sku;
  row[COL_IDX['*Category']] = String(catInfo.ebayCategoryId);
  row[COL_IDX['*Title']] = opts.title;
  row[COL_IDX['*ConditionID']] = String(catInfo.conditionId);
  row[COL_IDX['*Format']] = 'FixedPrice';
  row[COL_IDX['*Duration']] = 'GTC';
  row[COL_IDX['*Location']] = config.listing.shipsFrom;
  row[COL_IDX['*DispatchTimeMax']] = String(config.listing.dispatchDays);

  // ── Item specifics (required) ───────────────────────────────────────────────
  row[COL_IDX['*C:Brand']] = config.listing.brandName;
  row[COL_IDX['C:MPN']] = 'Does Not Apply';
  row[COL_IDX['C:Country of Origin']] = 'China';

  // Department — from catInfo.itemSpecifics or default "Unisex"
  row[COL_IDX['*C:Department']] = catInfo.itemSpecifics.Department || 'Unisex';

  // Type — from catInfo.itemSpecifics (required column)
  if (catInfo.itemSpecifics.Type) {
    row[COL_IDX['*C:Type']] = catInfo.itemSpecifics.Type;
  }

  // Style — from catInfo.itemSpecifics (optional, but column is required so leave empty if absent)
  if (catInfo.itemSpecifics.Style) {
    row[COL_IDX['*C:Style']] = catInfo.itemSpecifics.Style;
  }

  // Material, Pattern — extract from catInfo.itemSpecifics or product specs
  if (catInfo.itemSpecifics.Material) {
    row[COL_IDX['C:Material']] = catInfo.itemSpecifics.Material;
  }

  // Try to extract Material / Pattern from product specs if not already set
  if (prod.en.specificationsEn && prod.en.specificationsEn.length > 0) {
    for (const spec of prod.en.specificationsEn) {
      const name = spec.name.toLowerCase();
      if (!row[COL_IDX['C:Material']] && (name.includes('material') || name.includes('fabric'))) {
        row[COL_IDX['C:Material']] = spec.value.substring(0, 65);
      }
      if (!row[COL_IDX['C:Pattern']] && name.includes('pattern')) {
        row[COL_IDX['C:Pattern']] = spec.value.substring(0, 65);
      }
    }
  }

  // ── Business Policy Profiles (replaces inline shipping/return/payment fields) ─
  // When Business Policies are enabled on the seller account, eBay requires profile
  // names instead of inline fields. Inline ReturnsWithinOption etc. are rejected.
  row[COL_IDX['ShippingProfileName']] = config.businessPolicies.shippingProfileName;
  row[COL_IDX['ReturnProfileName']] = config.businessPolicies.returnProfileName;
  row[COL_IDX['PaymentProfileName']] = config.businessPolicies.paymentProfileName;

  // ── Description ─────────────────────────────────────────────────────────────
  if (opts.description) {
    row[COL_IDX['*Description']] = opts.description;
  }

  // ── Price & Quantity (NOT set on parent variation rows) ─────────────────────
  if (!opts.isParent) {
    row[COL_IDX['*StartPrice']] = String(opts.price);
    row[COL_IDX['*Quantity']] = String(config.listing.defaultStock);
  }

  // ── Images ──────────────────────────────────────────────────────────────────
  if (opts.galleryImages.length > 0) {
    // PicURL supports pipe-separated URLs for multiple images
    const allUrls = opts.galleryImages.slice(0, 12).map(img => img.imageUrl);
    row[COL_IDX['PicURL']] = allUrls.join('|');
    row[COL_IDX['GalleryType']] = 'Gallery';
  }

  // ── Required field fallbacks (for non-variation / standalone rows) ──────────
  // These are set ONLY if still empty — variation child rows override them later.
  // *C:Color, *C:Size, *C:Style are required by the template header.
  if (!row[COL_IDX['*C:Color']]) row[COL_IDX['*C:Color']] = 'Multicolor';
  if (!row[COL_IDX['*C:Size']])  row[COL_IDX['*C:Size']]  = 'One Size';
  if (!row[COL_IDX['*C:Style']] && !catInfo.itemSpecifics.Style) {
    row[COL_IDX['*C:Style']] = 'Fashion';
  }

  return row;
}

// ─── Variant helpers ──────────────────────────────────────────────────────────

function buildVariantMap(
  prod: ExportProduct,
): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  if (!prod.variantStructure) return map;

  for (const variant of prod.variantStructure) {
    const valueMap = new Map<string, string>();
    for (const val of variant.values) {
      const enName = (val.valueNameEn && val.valueNameEn.trim())
        ? val.valueNameEn.trim()
        : val.valueNameZh;
      valueMap.set(val.valueNameZh, enName);
    }
    const dimName = variant.variantNameEn || variant.variantNameZh;
    map.set(variant.variantNameZh, valueMap);
    map.set(dimName, valueMap);
  }
  return map;
}

function buildRelationDetails(
  variantValuesJson: Record<string, string>,
  variantMap: Map<string, Map<string, string>>,
): string {
  // eBay only accepts 'Color' and 'Size' as variation dimensions in RelationshipDetails.
  // Priority: explicit Color key wins; if no Color key, use the first non-Size dim as Color.
  // Style, Model, etc. are item specifics — NOT variation dimensions on their own.
  let colorPart: string | null = null;    // from an explicit isColorKey() dimension
  let fallbackPart: string | null = null; // from first non-color, non-size dimension
  let sizePart: string | null = null;

  for (const [zhKey, zhValue] of Object.entries(variantValuesJson)) {
    const enValue = variantMap.get(zhKey)?.get(zhValue) ?? zhValue;
    const cleaned = cleanVariantValue(enValue);

    if (isSizeKey(zhKey)) {
      if (!sizePart) sizePart = `Size=${cleaned}`;
    } else if (isColorKey(zhKey)) {
      if (!colorPart) colorPart = `Color=${cleaned}`;
    } else {
      // Style, Model, etc. — saved as fallback only
      if (!fallbackPart) fallbackPart = `Color=${cleaned}`;
    }
  }

  // Use explicit color if found, else promote the fallback (Style/Model) to Color
  const effectiveColor = colorPart ?? fallbackPart;
  const parts: string[] = [];
  if (effectiveColor) parts.push(effectiveColor);
  if (sizePart) parts.push(sizePart);
  // eBay child rows use pipe "|" to separate multiple variation dimensions:
  //   "Color=Blue|Size=M"  (matches eBay's Seller Hub bulk upload format)
  return parts.join('|');
}

function parseRelationDetails(details: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Child rows use "|" as separator between dimensions ("Color=Blue|Size=M")
  for (const part of details.split('|')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      result[part.substring(0, eq)] = part.substring(eq + 1);
    }
  }
  return result;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Pad a short line (like Info metadata) to 96 comma-separated columns
 * so every line in the file has the same column count.
 */
function padTo96(line: string): string {
  const count = (line.match(/,/g) || []).length + 1; // current column count
  if (count >= COLUMN_COUNT) return line;
  return line + ','.repeat(COLUMN_COUNT - count);
}
