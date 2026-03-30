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
  lines.push(`<h2>${escapeHTML(sanitizeTitle(title))}</h2>`);

  if (specs.length > 0) {
    lines.push('<h3>Specifications</h3>');
    lines.push('<ul>');
    for (const spec of specs) {
      if (spec.name && spec.value) {
        // Sanitize both spec name and value to remove prohibited medical terms
        const cleanName  = sanitizeTitle(spec.name);
        const cleanValue = sanitizeTitle(spec.value);
        if (cleanName && cleanValue) {
          lines.push(`<li><strong>${escapeHTML(cleanName)}</strong>: ${escapeHTML(cleanValue)}</li>`);
        }
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

function containsChinese(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

/** Fallback lookup for untranslated Chinese color/size names. */
const CHINESE_VALUE_MAP: Record<string, string> = {
  // Colors
  '红色': 'Red',     '红': 'Red',
  '蓝色': 'Blue',    '蓝': 'Blue',
  '绿色': 'Green',   '绿': 'Green',
  '黄色': 'Yellow',  '黄': 'Yellow',
  '白色': 'White',   '白': 'White',
  '黑色': 'Black',   '黑': 'Black',
  '紫色': 'Purple',  '紫': 'Purple',
  '粉色': 'Pink',    '粉': 'Pink',    '粉红': 'Pink',
  '橙色': 'Orange',  '橙': 'Orange',  '橘色': 'Orange',  '橘红': 'Orange Red',
  '灰色': 'Gray',    '灰': 'Gray',
  '棕色': 'Brown',   '棕': 'Brown',
  '金色': 'Gold',    '金': 'Gold',    '金黄': 'Golden Yellow',
  '银色': 'Silver',  '银': 'Silver',
  '浅蓝': 'Light Blue', '淡蓝': 'Light Blue', '天蓝': 'Sky Blue', '天蓝色': 'Sky Blue',
  '深蓝': 'Dark Blue',  '藏青色': 'Navy Blue', '藏青': 'Navy Blue',
  '深绿': 'Dark Green', '墨绿': 'Dark Green',
  '咖啡': 'Coffee Brown', '咖啡色': 'Coffee Brown',
  '荧光绿': 'Fluorescent Green', '翠绿': 'Emerald Green',
  '豆绿': 'Pea Green',   '军绿': 'Olive Green',
  '枣红': 'Maroon',      '玫红': 'Rose Red',   '玫瑰红': 'Rose Red',
  '红咖啡': 'Burgundy',  '酒红': 'Wine Red',   '酒红色': 'Wine Red',
  '卡其': 'Khaki',       '卡其色': 'Khaki',
  '米白': 'Off White',   '米色': 'Beige',      '奶白': 'Cream',
  '透明': 'Clear',       '彩色': 'Multicolor', '多色': 'Multicolor',
  '玫瑰金': 'Rose Gold', '香槟': 'Champagne',  '香槟色': 'Champagne',
  '宝蓝': 'Royal Blue',  '湖蓝': 'Lake Blue',  '孔雀蓝': 'Peacock Blue',
  '橄榄绿': 'Olive',     '草绿': 'Grass Green',
  '深红': 'Dark Red',    '暗红': 'Dark Red',
  '浅灰': 'Light Gray',  '深灰': 'Dark Gray',  '银灰': 'Silver Gray',
  '米黄': 'Cream Yellow','奶黄': 'Cream',
  '裸色': 'Nude',        '肤色': 'Skin Color',
  // Sizes
  '均码': 'One Size', '免费尺寸': 'One Size', '通用': 'One Size', '均一码': 'One Size',
  '小号': 'S',  '中号': 'M',  '大号': 'L',
  '加大': 'XL', '加大号': 'XL', '超大号': 'XXL', '特大号': 'XXL',
};

/** Characters eBay does not allow inside variation values. */
const VARIANT_ILLEGAL_CHARS = /[/\\()+*#@!%^&=<>{}[\]]/g;

function cleanVariantValue(raw: string): string {
  if (!raw) return raw;
  let name = raw.trim();

  // 1. Strip [English - Chinese] bracket patterns
  const bracketMatch = name.match(/^\[([^\]]+)\]/);
  if (bracketMatch) {
    name = bracketMatch[1].replace(/\s*-\s*/g, ' ').trim();
  } else {
    // 2. Strip Chinese|English or English|Chinese pipe-separated combos
    const parts = name.split(/[丨|]/).map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length >= 2) {
      // Prefer the non-Chinese part
      const enPart = parts.find(p => !containsChinese(p));
      name = enPart ?? parts[1];
    }
  }

  // 3. If still contains Chinese, look up in translation map
  if (containsChinese(name)) {
    const mapped = CHINESE_VALUE_MAP[name];
    if (mapped) {
      name = mapped;
    } else {
      // Strip Chinese chars and keep any remaining ASCII
      const ascii = name.replace(/[\u4e00-\u9fff]/g, '').trim();
      name = ascii.length > 0 ? ascii : 'Other';
    }
  }

  // 4. Remove characters eBay rejects in variation values
  name = name.replace(VARIANT_ILLEGAL_CHARS, ' ').replace(/\s{2,}/g, ' ').trim();

  // 5. eBay max variation value length is 65 chars
  if (name.length > 65) name = name.substring(0, 65).trim();
  return name || 'Other';
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

    // Skip products with untranslated Chinese titles — eBay US rejects non-English content
    if (containsChinese(en.titleEn)) {
      logger.warn('Skipping product with Chinese title (needs translation)', { id1688: prod.id1688 });
      continue;
    }

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
      // Deduplicate by RelationshipDetails — eBay error 21916586 fires when two child rows
      // produce the same combination (e.g. two SKUs that differ only in a Style dimension
      // that we don't export, resulting in identical Color values).
      const seenRelDets = new Set<string>();

      for (const sku of prod.skus!) {
        if (!sku.available) continue;

        const childSku = `${baseSku}-${sku.id}`;
        const childPrice = calculatePriceUsd(sku.priceCny || prod.priceCny, en.priceUsd);
        const relationDetails = buildRelationDetails(sku.variantValuesJson, variantMap, catInfo.variationDimensions);

        // Skip duplicate variation combinations (same RelationshipDetails already seen)
        if (!relationDetails || seenRelDets.has(relationDetails)) continue;
        seenRelDets.add(relationDetails);

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

        // eBay rule (error 87): VariationSpecifics and ItemSpecifics MUST be different fields.
        // Color and Size are declared in RelationshipDetails (VariationSpecifics).
        // Therefore they must NOT appear in *C:Color / *C:Size (ItemSpecifics) on variation rows.
        // Clear C:Color and C:Size on child rows; only track values for parent RelDet aggregation.
        // Cap at 30 unique values per dimension (eBay hard limit).
        if (variantValues.Color && allColors.size < 30) allColors.add(variantValues.Color);
        if (variantValues.Size  && allSizes.size  < 30) allSizes.add(variantValues.Size);
        childRow[COL_IDX['*C:Color']] = ''; // cleared — color is in RelationshipDetails
        childRow[COL_IDX['*C:Size']]  = ''; // cleared — size is in RelationshipDetails

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

      // eBay rule (error 87): VariationSpecifics and ItemSpecifics MUST be different fields.
      // Color and Size are declared in RelationshipDetails (VariationSpecifics).
      // They must NOT appear in *C:Color / *C:Size (ItemSpecifics) on variation rows.
      // Clear both on the parent; the variation info is fully captured in RelationshipDetails.
      parentRow[COL_IDX['*C:Color']] = ''; // cleared — all colors declared in RelationshipDetails
      parentRow[COL_IDX['*C:Size']]  = ''; // cleared — all sizes declared in RelationshipDetails

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

  // Generic pass-through: any extra itemSpecifics keys that have a matching C: column
  // (e.g. 'US Shoe Size', 'US Shoe Size (Men\'s)', 'Base Metal', etc.)
  for (const [key, val] of Object.entries(catInfo.itemSpecifics)) {
    if (['Department', 'Type', 'Style', 'Material', 'Country/Region of Manufacture'].includes(key)) continue;
    const colKey = `C:${key}` as string;
    if (COL_IDX[colKey] !== undefined && val) {
      row[COL_IDX[colKey]] = String(val);
    }
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
  allowedDimensions: string[], // from catInfo.variationDimensions
): string {
  // eBay only accepts 'Color' and 'Size' as variation dimensions in RelationshipDetails.
  // Priority: explicit Color key wins; if no Color key, use the first non-Size dim as Color.
  // Style, Model, etc. are item specifics — NOT variation dimensions on their own.
  // allowedDimensions controls which dims we actually export (e.g. hats only allow Color).
  const allowSize = allowedDimensions.some(d => d.toLowerCase() === 'size');

  let colorPart: string | null = null;    // from an explicit isColorKey() dimension
  let fallbackPart: string | null = null; // from first non-color, non-size dimension
  let sizePart: string | null = null;

  for (const [zhKey, zhValue] of Object.entries(variantValuesJson)) {
    const enValue = variantMap.get(zhKey)?.get(zhValue) ?? zhValue;
    const cleaned = cleanVariantValue(enValue);
    if (!cleaned || cleaned === 'Other') continue; // skip empty/untranslatable

    if (isSizeKey(zhKey)) {
      // Only include Size if the category declares it as a variation dimension
      if (allowSize && !sizePart) sizePart = `Size=${cleaned}`;
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
