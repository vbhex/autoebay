/**
 * eBay CSV generator for Seller Hub Reports bulk upload.
 *
 * Generates CSV files ready for upload via:
 *   Seller Hub → Reports → Uploads → Upload from file
 *
 * Supports both standalone listings and variation listings (Color × Size).
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists, isBannedBrand, truncateToBytes, roundPrice, escapeCSV } from '../utils/helpers';
import { CSV_COLUMNS, COL_IDX, emptyRow, getHeaderRow } from './column-mapping';
import { ExportProduct, EBAY_CATEGORY_MAP, EbayCategoryInfo } from '../models/product';

const logger = createChildLogger('csv-generator');

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

// ─── Description builder ──────────────────────────────────────────────────────

function buildDescription(
  title: string,
  specs: Array<{ name: string; value: string }>
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
  lines.push(`<li>Estimated delivery: 15-30 business days</li>`);
  lines.push('<li>30-day return policy</li>');
  lines.push('</ul>');

  // eBay File Exchange requires single-line HTML — no literal newlines in CSV cells
  return lines.join('');
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Color helpers ────────────────────────────────────────────────────────────

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

  const rows: string[][] = [];
  rows.push(getHeaderRow());

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
    const title = truncateToBytes(en.titleEn, 80);
    const baseSku = `1688-${prod.id1688}`;

    categoriesUsed.add(prod.category);

    const hasVariants = prod.skus && prod.skus.length > 1 && prod.variantStructure && prod.variantStructure.length > 0;

    if (hasVariants) {
      // Parent row
      const parentRow = buildBaseRow(prod, catInfo, {
        sku: baseSku,
        title,
        description,
        price: basePrice,
        galleryImages,
        isParent: true,
      });
      rows.push(parentRow);
      totalDataRows++;

      // Child rows
      const variantMap = buildVariantMap(prod);

      for (const sku of prod.skus!) {
        if (!sku.available) continue;

        const childSku = `${baseSku}-${sku.id}`;
        const childPrice = calculatePriceUsd(sku.priceCny || prod.priceCny, en.priceUsd);
        const relationDetails = buildRelationDetails(sku.variantValuesJson, variantMap);

        const childRow = buildBaseRow(prod, catInfo, {
          sku: childSku,
          title,
          description: '',
          price: childPrice,
          galleryImages: [],
          isParent: false,
        });

        childRow[COL_IDX['Relationship']] = 'Variation';
        childRow[COL_IDX['RelationshipDetails']] = relationDetails;

        // Populate C:Color, C:Size, C:Style columns from variant values
        const variantValues = parseRelationDetails(relationDetails);
        if (variantValues.Color) childRow[COL_IDX['C:Color']] = variantValues.Color;
        if (variantValues.Size) childRow[COL_IDX['C:Size']] = variantValues.Size;
        if (variantValues.Style) childRow[COL_IDX['C:Style']] = variantValues.Style;

        if (sku.imageUrl) {
          childRow[COL_IDX['PicURL']] = sku.imageUrl;
        }

        rows.push(childRow);
        totalDataRows++;
      }
    } else {
      // Standalone row
      const row = buildBaseRow(prod, catInfo, {
        sku: baseSku,
        title,
        description,
        price: basePrice,
        galleryImages,
        isParent: false,
      });
      rows.push(row);
      totalDataRows++;
    }
  }

  if (totalDataRows === 0) {
    logger.info('No rows generated');
    return null;
  }

  const csvContent = rows.map(row => row.map(escapeCSV).join(',')).join('\n') + '\n';
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

interface BaseRowOpts {
  sku: string;
  title: string;
  description: string;
  price: number;
  galleryImages: Array<{ imageUrl: string }>;
  isParent: boolean;
}

function buildBaseRow(
  prod: ExportProduct,
  catInfo: EbayCategoryInfo,
  opts: BaseRowOpts
): string[] {
  const row = emptyRow();

  row[COL_IDX['Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)']] = 'Add';
  row[COL_IDX['CustomLabel']] = opts.sku;
  row[COL_IDX['Category']] = String(catInfo.ebayCategoryId);
  row[COL_IDX['Title']] = opts.title;
  row[COL_IDX['ConditionID']] = String(catInfo.conditionId);
  row[COL_IDX['Description']] = opts.description;
  row[COL_IDX['Format']] = 'FixedPrice';
  row[COL_IDX['Duration']] = 'GTC';
  row[COL_IDX['Currency']] = 'USD';
  row[COL_IDX['Location']] = config.listing.shipsFrom;
  row[COL_IDX['Country']] = 'CN';
  row[COL_IDX['DispatchTimeMax']] = String(config.listing.dispatchDays);

  // Shipping — direct fields (no business policies)
  row[COL_IDX['ShippingType']] = 'Flat';
  row[COL_IDX['ShippingService-1:Option']] = 'EconomyShippingFromOutsideUS';
  row[COL_IDX['ShippingService-1:Cost']] = String(config.shipping.cost);
  row[COL_IDX['ShippingService-1:FreeShipping']] = config.shipping.cost === 0 ? 'y' : 'n';
  row[COL_IDX['IntlShippingService-1:Option']] = 'StandardInternational';
  row[COL_IDX['IntlShippingService-1:Cost']] = String(config.shipping.cost);
  row[COL_IDX['IntlShippingService-1:Locations']] = 'Worldwide';

  // Returns
  row[COL_IDX['ReturnsAcceptedOption']] = 'ReturnsAccepted';
  row[COL_IDX['ReturnsWithinOption']] = 'Days30';
  row[COL_IDX['RefundOption']] = 'MoneyBack';
  row[COL_IDX['ShippingCostPaidByOption']] = 'Buyer';

  // Item specifics
  row[COL_IDX['Brand']] = config.listing.brandName;
  row[COL_IDX['C:MPN']] = 'Does Not Apply';
  row[COL_IDX['C:Country/Region of Manufacture']] = 'China';

  if (!opts.isParent) {
    row[COL_IDX['StartPrice']] = String(opts.price);
    row[COL_IDX['Quantity']] = String(config.listing.defaultStock);
  }

  if (opts.galleryImages.length > 0) {
    row[COL_IDX['PicURL']] = opts.galleryImages[0].imageUrl;
    if (opts.galleryImages.length > 1) {
      const additionalImages = opts.galleryImages.slice(1, 12).map(img => img.imageUrl);
      row[COL_IDX['*PicURL']] = additionalImages.join('|');
    }
  }

  return row;
}

function buildVariantMap(
  prod: ExportProduct
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

function parseRelationDetails(details: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of details.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      result[part.substring(0, eq)] = part.substring(eq + 1);
    }
  }
  return result;
}

function buildRelationDetails(
  variantValuesJson: Record<string, string>,
  variantMap: Map<string, Map<string, string>>
): string {
  const parts: string[] = [];

  for (const [zhKey, zhValue] of Object.entries(variantValuesJson)) {
    const enValue = variantMap.get(zhKey)?.get(zhValue) ?? zhValue;
    const cleaned = cleanVariantValue(enValue);

    let dimName: string;
    if (isColorKey(zhKey)) {
      dimName = 'Color';
    } else if (isSizeKey(zhKey)) {
      dimName = 'Size';
    } else {
      dimName = 'Style';
    }

    parts.push(`${dimName}=${cleaned}`);
  }

  return parts.join(';');
}
