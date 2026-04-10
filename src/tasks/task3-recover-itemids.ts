/**
 * Task: Recover item IDs from eBay Seller Hub
 * 
 * After Task 3 submits listings, this queries the Seller Hub and matches listings
 * by title to recover the item IDs for products that were submitted but didn't
 * return item IDs in the confirmation page.
 */

import { Page } from 'puppeteer';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { sleep } from '../utils/helpers';
import { initSchema, closeDatabase, upsertPlatformListing } from '../database/db';
import { getProductsForEbayExport } from '../database/repositories';
import { launchBrowser, loadCookies, ensureLoggedIn } from '../browser/browser-utils';

const logger = createChildLogger('task3-recover-itemids');

async function scrapeSellerHubListings(page: Page): Promise<Array<{ itemId: string; title: string }>> {
  logger.info('Navigating to Seller Hub listings...');
  await page.goto('https://www.ebay.com/sh/lst/active', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  const listings = await page.evaluate(() => {
    const items: Array<{ itemId: string; title: string }> = [];

    // Get all table rows in the listings table
    const rows = document.querySelectorAll('tr, [role="row"]');

    for (const row of Array.from(rows)) {
      // Extract title from link in Item column
      const titleLink = row.querySelector('a[href*="/itm/"]');
      if (!titleLink) continue;

      const href = titleLink.getAttribute('href');
      const match = href?.match(/\/itm\/(\d+)/);

      if (match) {
        const itemId = match[1];
        const title = titleLink.textContent?.trim() || '';

        if (itemId && title && title.length > 5) {
          items.push({ itemId, title });
        }
      }
    }

    return items;
  }).catch((err) => {
    logger.error('Error scraping listings', { error: err.message });
    return [];
  });

  logger.info(`Scraped ${listings.length} listings from Seller Hub`);
  return listings;
}

async function main() {
  logger.info('Task: Recover item IDs from Seller Hub');

  await initSchema();

  // Get products that need item IDs
  const products = await getProductsForEbayExport(100, undefined, true);
  const productsNeedingIds = products;

  if (productsNeedingIds.length === 0) {
    logger.info('All products already have item IDs');
    closeDatabase();
    return;
  }

  logger.info(`Found ${productsNeedingIds.length} products needing item IDs`);

  // Launch browser
  const browser = await launchBrowser(false);
  const page = await browser.newPage();
  await loadCookies(page);
  await ensureLoggedIn(page);

  // Scrape Seller Hub
  const ebayListings = await scrapeSellerHubListings(page);
  logger.info(`Found ${ebayListings.length} listings on eBay`);

  // Match products to listings by title similarity
  let matched = 0;
  for (const product of productsNeedingIds) {
    const productTitle = product.en.titleEn.toLowerCase().substring(0, 40);

    const match = ebayListings.find(listing =>
      listing.title.toLowerCase().includes(productTitle) ||
      productTitle.includes(listing.title.toLowerCase().substring(0, 30))
    );

    if (match) {
      logger.info(`Matched product ${product.id1688} to eBay item ${match.itemId}`);
      await upsertPlatformListing(product.id1688, 'ebay', match.itemId);
      matched++;
    }
  }

  logger.info(`Recovered ${matched} item IDs from Seller Hub`);

  await browser.close();
  closeDatabase();
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
