import { RowDataPacket } from 'mysql2/promise';
import { getPool } from './db';
import { createChildLogger } from '../utils/logger';
import {
  ExportProduct,
  ProductEN,
  ImageOk,
  VariantEN,
  ProductVariant,
  VariantValue,
  VariantSku,
  EBAY_CATEGORIES,
} from '../models/product';

const logger = createChildLogger('repositories');

function inList(count: number): string {
  return Array(count).fill('?').join(', ');
}

// ─── Batch EN data ─────────────────────────────────────────────────────────

async function batchGetProductEN(
  productIds: number[]
): Promise<Map<number, ProductEN>> {
  if (productIds.length === 0) return new Map();
  const p = await getPool();
  const [rows] = await p.query<RowDataPacket[]>(
    `SELECT product_id AS productId, title_en AS titleEn, description_en AS descriptionEn,
            specifications_en AS specificationsEn, price_usd AS priceUsd,
            category AS aeCategory
     FROM products_en WHERE product_id IN (${inList(productIds.length)})`,
    productIds
  );
  const map = new Map<number, ProductEN>();
  for (const row of rows as any[]) {
    row.specificationsEn = typeof row.specificationsEn === 'string'
      ? JSON.parse(row.specificationsEn) : (row.specificationsEn ?? []);
    map.set(row.productId, row as ProductEN);
  }
  return map;
}

// ─── Batch images ──────────────────────────────────────────────────────────

async function batchGetImagesOk(
  productIds: number[],
  passedOnly = true
): Promise<Map<number, ImageOk[]>> {
  if (productIds.length === 0) return new Map();
  const p = await getPool();
  const where = passedOnly ? 'AND ok.passed = 1' : '';
  const [rows] = await p.query<RowDataPacket[]>(
    `SELECT ok.id,
            ok.product_id AS productId,
            ok.image_url AS imageUrl,
            ok.image_type AS imageType,
            ok.sort_order AS sortOrder,
            ok.passed
     FROM products_images_ok ok
     WHERE ok.product_id IN (${inList(productIds.length)}) ${where}
     ORDER BY ok.product_id, ok.sort_order`,
    productIds
  );
  const map = new Map<number, ImageOk[]>();
  for (const row of rows as any[]) {
    if (!map.has(row.productId)) map.set(row.productId, []);
    map.get(row.productId)!.push(row as ImageOk);
  }
  return map;
}

// ─── Batch variants (old flat structure) ───────────────────────────────────

async function batchGetVariantsEN(
  productIds: number[]
): Promise<Map<number, VariantEN[]>> {
  if (productIds.length === 0) return new Map();
  const p = await getPool();

  let hasTable = true;
  try {
    await p.query('SELECT 1 FROM products_variants_en LIMIT 0');
  } catch {
    hasTable = false;
  }
  if (!hasTable) return new Map();

  const [rows] = await p.query<RowDataPacket[]>(
    `SELECT id, product_id AS productId, raw_variant_id AS rawVariantId,
            option_name_en AS optionNameEn, option_value_en AS optionValueEn,
            option_value_zh AS optionValueZh, price_usd AS priceUsd,
            color_family AS colorFamily, sort_order AS sortOrder
     FROM products_variants_en
     WHERE product_id IN (${inList(productIds.length)})
     ORDER BY product_id, sort_order`,
    productIds
  );
  const map = new Map<number, VariantEN[]>();
  for (const row of rows as any[]) {
    if (!map.has(row.productId)) map.set(row.productId, []);
    map.get(row.productId)!.push(row as VariantEN);
  }
  return map;
}

// ─── Batch normalized variant structure ────────────────────────────────────

async function batchGetProductVariantsWithValues(
  productIds: number[]
): Promise<Map<number, Array<ProductVariant & { values: VariantValue[] }>>> {
  if (productIds.length === 0) return new Map();
  const p = await getPool();

  const [variants] = await p.query<RowDataPacket[]>(
    `SELECT id, product_id AS productId, variant_name_zh AS variantNameZh,
            variant_name_en AS variantNameEn, sort_order AS sortOrder
     FROM product_variants
     WHERE product_id IN (${inList(productIds.length)})
     ORDER BY product_id, sort_order`,
    productIds
  );

  if (variants.length === 0) {
    return new Map(productIds.map(id => [id, []]));
  }

  const variantIds = (variants as any[]).map(v => v.id);
  const [values] = await p.query<RowDataPacket[]>(
    `SELECT id, variant_id AS variantId, value_name_zh AS valueNameZh,
            value_name_en AS valueNameEn, image_url AS imageUrl, sort_order AS sortOrder
     FROM variant_values
     WHERE variant_id IN (${inList(variantIds.length)})
     ORDER BY variant_id, sort_order`,
    variantIds
  );

  const valuesByVariant = new Map<number, VariantValue[]>();
  for (const val of values as any[]) {
    if (!valuesByVariant.has(val.variantId)) valuesByVariant.set(val.variantId, []);
    valuesByVariant.get(val.variantId)!.push(val as VariantValue);
  }

  const map = new Map<number, Array<ProductVariant & { values: VariantValue[] }>>();
  for (const productId of productIds) map.set(productId, []);
  for (const v of variants as any[]) {
    const entry = { ...(v as ProductVariant), values: valuesByVariant.get(v.id) ?? [] };
    map.get(v.productId)!.push(entry);
  }
  return map;
}

// ─── Batch variant SKUs ────────────────────────────────────────────────────

async function batchGetVariantSkus(
  productIds: number[],
  availableOnly = false
): Promise<Map<number, VariantSku[]>> {
  if (productIds.length === 0) return new Map();
  const p = await getPool();
  const where = availableOnly ? 'AND available = 1' : '';
  const [rows] = await p.query<RowDataPacket[]>(
    `SELECT id, product_id AS productId, sku_code AS skuCode,
            variant_values_json AS variantValuesJson, price_cny AS priceCny,
            stock, available, image_url AS imageUrl
     FROM variant_skus
     WHERE product_id IN (${inList(productIds.length)}) ${where}
     ORDER BY product_id, id`,
    productIds
  );
  const map = new Map<number, VariantSku[]>();
  for (const row of rows as any[]) {
    const sku: VariantSku = {
      ...row,
      variantValuesJson: typeof row.variantValuesJson === 'string'
        ? JSON.parse(row.variantValuesJson) : row.variantValuesJson,
      priceCny: Number(row.priceCny),
    };
    if (!map.has(row.productId)) map.set(row.productId, []);
    map.get(row.productId)!.push(sku);
  }
  return map;
}

// ─── Main export query ─────────────────────────────────────────────────────

export async function getProductsForEbayExport(
  limit: number,
  categoryFilter?: string,
  includeAlreadyExported = false
): Promise<ExportProduct[]> {
  const p = await getPool();

  let categories = EBAY_CATEGORIES;
  if (categoryFilter) {
    if (!EBAY_CATEGORIES.includes(categoryFilter)) {
      logger.warn('Category not in eBay eligible list', { category: categoryFilter });
      return [];
    }
    categories = [categoryFilter];
  }

  const placeholders = inList(categories.length);
  const safeLimit = Math.max(1, Math.floor(limit));

  const statuses = includeAlreadyExported
    ? "('imported', 'csv_generated', 'ebay_exported')"
    : "('imported')";

  const [products] = await p.query<RowDataPacket[]>(
    `SELECT p.id, p.id_1688 AS id1688, p.category, COALESCE(pr.price_cny, 0) AS priceCny
     FROM products p
     LEFT JOIN products_raw pr ON pr.product_id = p.id
     WHERE p.status IN ${statuses}
       AND p.category IN (${placeholders})
     ORDER BY p.id ASC
     LIMIT ${safeLimit}`,
    categories
  );

  if ((products as any[]).length === 0) {
    logger.info('No products found for eBay export');
    return [];
  }

  const productList = products as any[];
  const productIds = productList.map(r => r.id as number);

  logger.info(`Fetching data for ${productIds.length} products in batch...`);

  const [enMap, imagesMap, variantsEnMap, variantStructureMap, skusMap] = await Promise.all([
    batchGetProductEN(productIds),
    batchGetImagesOk(productIds, true),
    batchGetVariantsEN(productIds),
    batchGetProductVariantsWithValues(productIds),
    batchGetVariantSkus(productIds, true),
  ]);

  const results: ExportProduct[] = [];

  for (const prod of productList) {
    const en = enMap.get(prod.id);
    if (!en) {
      logger.debug('No EN data, skipping', { id1688: prod.id1688 });
      continue;
    }

    const images = imagesMap.get(prod.id) ?? [];
    if (images.length === 0) {
      logger.debug('No passed images, skipping', { id1688: prod.id1688 });
      continue;
    }

    const rawVariants = variantsEnMap.get(prod.id) ?? [];
    const variantsWithCny: Array<VariantEN & { priceCny: number }> = rawVariants.map(v => ({
      ...v,
      priceCny: 0,
    }));

    results.push({
      id: prod.id,
      id1688: prod.id1688,
      category: prod.category,
      priceCny: Number(prod.priceCny),
      en,
      images,
      variants: variantsWithCny,
      variantStructure: variantStructureMap.get(prod.id) ?? [],
      skus: skusMap.get(prod.id) ?? [],
    });
  }

  logger.info('Products loaded for eBay export', {
    queried: productList.length,
    withData: results.length,
    categories: categories.length,
  });

  return results;
}

// ─── Status tracking ────────────────────────────────────────────────────────

export async function markProductsAsEbayExported(productIds: number[]): Promise<void> {
  if (productIds.length === 0) return;
  const p = await getPool();
  await p.query(
    `UPDATE products SET status = 'ebay_exported'
     WHERE id IN (${inList(productIds.length)})`,
    productIds
  );
  logger.info('Marked products as ebay_exported', { count: productIds.length });
}

export async function markProductsAsCsvGenerated(productIds: number[]): Promise<void> {
  if (productIds.length === 0) return;
  const p = await getPool();
  await p.query(
    `UPDATE products SET status = 'csv_generated'
     WHERE id IN (${inList(productIds.length)})`,
    productIds
  );
  logger.info('Marked products as csv_generated', { count: productIds.length });
}
