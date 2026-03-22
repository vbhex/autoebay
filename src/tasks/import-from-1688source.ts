/**
 * Import authorized products from 1688_source into ebay_autostore.
 *
 * Reads translated + authorized products from 1688_source and inserts them
 * into the local ebay_autostore database, ready for CSV generation.
 *
 * Only imports products whose categories map to eBay categories.
 *
 * Usage:
 *   npm run task:import
 *   npm run task:import -- --limit 50
 *   npm run task:import -- --category "quartz watches"
 *   npm run task:import -- --dry-run
 */

import { config } from '../config';
import { getPool, initSchema, closeDatabase } from '../database/db';
import { createChildLogger } from '../utils/logger';
import { EBAY_CATEGORIES } from '../models/product';
import { RowDataPacket } from 'mysql2/promise';

const logger = createChildLogger('import');

interface SourceProduct {
  id: number;
  id_1688: string;
  category: string;
  url: string;
  title_zh: string;
  thumbnail_url: string;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find((_, i, a) => a[i - 1] === '--limit') || '100');
  const categoryFilter = args.find((_, i, a) => a[i - 1] === '--category') || undefined;
  const dryRun = args.includes('--dry-run');

  logger.info('Starting import from 1688_source', { limit, categoryFilter, dryRun });

  await initSchema();
  const pool = await getPool();
  const sourceDb = config.sourceDb.database;

  let categories = EBAY_CATEGORIES;
  if (categoryFilter) {
    if (!EBAY_CATEGORIES.includes(categoryFilter)) {
      logger.error('Category not in eBay eligible list', { category: categoryFilter });
      return;
    }
    categories = [categoryFilter];
  }

  const placeholders = categories.map(() => '?').join(', ');

  // Find products in 1688_source that are:
  // 1. Translated (have products_en data)
  // 2. In authorized_products (brand-verified)
  // 3. In a category that maps to eBay
  // 4. Not already imported into ebay_autostore
  const [sourceProducts] = await pool.query<RowDataPacket[]>(`
    SELECT sp.id, sp.id_1688, sp.category, sp.url, sp.title_zh, sp.thumbnail_url
    FROM ${sourceDb}.products sp
    INNER JOIN ${sourceDb}.authorized_products ap
      ON ap.product_id = sp.id AND ap.active = TRUE
    INNER JOIN ${sourceDb}.products_en spe
      ON spe.product_id = sp.id
    WHERE sp.category IN (${placeholders})
      AND sp.status IN ('translated', 'ae_enriched', 'exported', 'amazon_exported')
      AND sp.id_1688 NOT IN (
        SELECT id_1688 FROM products
      )
    ORDER BY sp.id ASC
    LIMIT ?
  `, [...categories, limit]);

  const products = sourceProducts as SourceProduct[];
  logger.info(`Found ${products.length} products to import`);

  if (products.length === 0 || dryRun) {
    if (dryRun) logger.info('Dry run — no changes made');
    closeDatabase();
    return;
  }

  let imported = 0;

  for (const sp of products) {
    try {
      // Insert product
      const [insertResult] = await pool.query<any>(
        `INSERT INTO products (id_1688, source_product_id, status, url, title_zh, category, thumbnail_url)
         VALUES (?, ?, 'imported', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE source_product_id = VALUES(source_product_id)`,
        [sp.id_1688, sp.id, sp.url, sp.title_zh, sp.category, sp.thumbnail_url]
      );

      const localProductId = insertResult.insertId || (
        await pool.query<RowDataPacket[]>('SELECT id FROM products WHERE id_1688 = ?', [sp.id_1688])
      )[0]?.[0]?.id;

      if (!localProductId) continue;

      // Copy products_raw
      await pool.query(`
        INSERT IGNORE INTO products_raw (product_id, title_zh, description_zh, specifications_zh, price_cny, seller_name, seller_url)
        SELECT ?, spr.title_zh, spr.description_zh, spr.specifications_zh, spr.price_cny, spr.seller_name, spr.seller_url
        FROM ${sourceDb}.products_raw spr
        WHERE spr.product_id = ?
      `, [localProductId, sp.id]);

      // Copy products_en
      await pool.query(`
        INSERT IGNORE INTO products_en (product_id, title_en, description_en, specifications_en, price_usd, category)
        SELECT ?, spe.title_en, spe.description_en, spe.specifications_en, spe.price_usd, spe.category
        FROM ${sourceDb}.products_en spe
        WHERE spe.product_id = ?
      `, [localProductId, sp.id]);

      // Copy products_images_ok
      await pool.query(`
        INSERT IGNORE INTO products_images_ok (product_id, raw_image_id, image_url, image_type, sort_order, passed)
        SELECT ?, spi.raw_image_id, spi.image_url, spi.image_type, spi.sort_order, spi.passed
        FROM ${sourceDb}.products_images_ok spi
        WHERE spi.product_id = ? AND spi.passed = 1
      `, [localProductId, sp.id]);

      // Copy product_variants
      const [sourceVariants] = await pool.query<RowDataPacket[]>(`
        SELECT id, variant_name_zh, variant_name_en, sort_order
        FROM ${sourceDb}.product_variants
        WHERE product_id = ?
        ORDER BY sort_order
      `, [sp.id]);

      for (const sv of sourceVariants as any[]) {
        const [varResult] = await pool.query<any>(
          `INSERT INTO product_variants (product_id, variant_name_zh, variant_name_en, sort_order)
           VALUES (?, ?, ?, ?)`,
          [localProductId, sv.variant_name_zh, sv.variant_name_en, sv.sort_order]
        );
        const newVariantId = varResult.insertId;

        // Copy variant_values
        await pool.query(`
          INSERT INTO variant_values (variant_id, value_name_zh, value_name_en, image_url, sort_order)
          SELECT ?, vv.value_name_zh, vv.value_name_en, vv.image_url, vv.sort_order
          FROM ${sourceDb}.variant_values vv
          WHERE vv.variant_id = ?
          ORDER BY vv.sort_order
        `, [newVariantId, sv.id]);
      }

      // Copy variant_skus
      await pool.query(`
        INSERT INTO variant_skus (product_id, sku_code, variant_values_json, price_cny, stock, available, image_url)
        SELECT ?, vs.sku_code, vs.variant_values_json, vs.price_cny, vs.stock, vs.available, vs.image_url
        FROM ${sourceDb}.variant_skus vs
        WHERE vs.product_id = ?
      `, [localProductId, sp.id]);

      imported++;
      if (imported % 10 === 0) {
        logger.info(`Imported ${imported}/${products.length}...`);
      }
    } catch (err: any) {
      logger.error('Failed to import product', { id1688: sp.id_1688, error: err.message });
    }
  }

  logger.info('Import complete', { total: products.length, imported });
  closeDatabase();
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
