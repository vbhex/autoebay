/**
 * Task 1: Generate eBay CSV for Seller Hub Reports bulk upload.
 *
 * Queries imported products from ebay_autostore, generates a CSV file
 * suitable for uploading via eBay Seller Hub → Reports → Uploads.
 *
 * Usage:
 *   npm run task:csv                          # default 50 products
 *   npm run task:csv -- --limit 100
 *   npm run task:csv -- --category "quartz watches"
 *   npm run task:csv -- --dry-run
 *   npm run task:csv -- --regenerate          # re-export already-exported
 */

import { getPool, initSchema, closeDatabase } from '../database/db';
import { getProductsForEbayExport, markProductsAsCsvGenerated } from '../database/repositories';
import { generateCSV } from '../csv/csv-generator';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger('task1-csv-gen');

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find((_, i, a) => a[i - 1] === '--limit') || '50');
  const categoryFilter = args.find((_, i, a) => a[i - 1] === '--category') || undefined;
  const dryRun = args.includes('--dry-run');
  const regenerate = args.includes('--regenerate');

  logger.info('Starting eBay CSV generation', { limit, categoryFilter, dryRun, regenerate });

  await initSchema();

  const products = await getProductsForEbayExport(limit, categoryFilter, regenerate);

  if (products.length === 0) {
    logger.info('No products found for export');
    closeDatabase();
    return;
  }

  logger.info(`Processing ${products.length} products...`);

  const result = await generateCSV(products);

  if (!result) {
    logger.info('No CSV generated (all products filtered or no data)');
    closeDatabase();
    return;
  }

  logger.info('CSV generation complete', {
    file: result.filePath,
    products: result.productCount,
    rows: result.rowCount,
    categories: result.categories,
  });

  if (!dryRun) {
    const exportedIds = products.map(p => p.id);
    await markProductsAsCsvGenerated(exportedIds);
    logger.info(`Marked ${exportedIds.length} products as csv_generated`);
  } else {
    logger.info('Dry run — no status changes made');
  }

  closeDatabase();
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
