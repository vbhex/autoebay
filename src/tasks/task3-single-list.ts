/**
 * Task 3: Create eBay listings one at a time via browser automation.
 *
 * Automates the manual listing flow at:
 *   https://www.ebay.com/sl/prelist/home?sr=shListingsCTA
 *
 * Phase 1: Single-variant products only (no Color/Size variations).
 * Phase 2 (future): Multi-variant support.
 *
 * Usage:
 *   npm run task:list                          # List up to 5 products
 *   npm run task:list -- --limit 10            # List up to 10 products
 *   npm run task:list -- --product-id 42       # List a specific product
 *   npm run task:list -- --category "beanies"  # Filter by category
 *   npm run task:list -- --dry-run             # Fill form but don't submit
 *   npm run task:list -- --single-only         # Skip multi-variant products
 */

import path from 'path';
import { Page } from 'puppeteer';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { sleep } from '../utils/helpers';
import { initSchema, upsertPlatformListing, closeDatabase } from '../database/db';
import {
  getProductsForEbayExport,
  getProductById,
  markProductAsListed,
  markProductAsListFailed,
} from '../database/repositories';
import { launchBrowser, loadCookies, ensureLoggedIn } from '../browser/browser-utils';
import { downloadProductImages, cleanupTempImages } from '../browser/image-downloader';
import { takeDebugScreenshot, clickButtonByText, scrollToBottom, getPageButtons } from '../browser/form-helpers';
import { prepareListingData, ListingData } from '../listing/listing-data-preparer';

const logger = createChildLogger('task3-single-list');

const PRELIST_URL = 'https://www.ebay.com/sl/prelist/home?sr=shListingsCTA';

// ─── Core listing flow ───────────────────────────────────────────────────────

async function listSingleProduct(
  page: Page,
  data: ListingData,
  dryRun: boolean,
): Promise<string | null> {
  logger.info(`=== Listing product: ${data.id1688} ===`);
  logger.info(`Title: ${data.title}`);
  logger.info(`Category: ${data.categoryKey} → ${data.category.ebayCategoryName} (${data.category.ebayCategoryId})`);
  logger.info(`Price: $${data.price}`);

  // Step 1: Navigate to prelist page
  logger.info('Step 1: Navigating to prelist page...');
  await page.goto(PRELIST_URL, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(2000);

  // Step 2: Enter title in search bar and search
  logger.info('Step 2: Entering product title in search bar...');
  try {
    // The search input on the prelist page
    await page.waitForSelector('input[type="text"], input[type="search"], input[placeholder*="brand"], input[placeholder*="Enter"]', { timeout: 10000 });
    const searchInput = await page.$('input[type="text"], input[type="search"], input[placeholder*="brand"], input[placeholder*="Enter"]');
    if (searchInput) {
      await searchInput.click({ clickCount: 3 });
      await searchInput.type(data.title, { delay: 20 });
      await sleep(500);

      // Click Search button
      const searchClicked = await clickButtonByText(page, 'Search', 5000);
      if (!searchClicked) {
        // Try pressing Enter instead
        await page.keyboard.press('Enter');
      }
      await sleep(3000);
    }
  } catch (err: any) {
    logger.warn('Could not find search input', { error: err.message });
    await takeDebugScreenshot(page, `search-fail-${data.id1688}`);
    throw new Error('Failed to find search input on prelist page');
  }

  await takeDebugScreenshot(page, `after-search-${data.id1688}`);

  // Step 3: Select category — look for "Continue without match" or category selection
  logger.info('Step 3: Selecting category...');
  await sleep(2000);

  // eBay may show catalog matches or ask to select category
  // Try "Continue without match" first (for non-catalog products)
  const continueClicked = await clickButtonByText(page, 'Continue without match', 5000);
  if (continueClicked) {
    logger.info('Clicked "Continue without match"');
    await sleep(2000);
  }

  // If we need to select a category, look for category selector
  // Try to find and select the correct eBay category
  try {
    // Check if there's a category input/selector on the page
    const hasCategorySelector = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('select a category') || text.includes('choose a category');
    });

    if (hasCategorySelector) {
      logger.info('Category selector found, attempting to select...');
      // Type category name to filter
      const categoryInput = await page.$('input[placeholder*="category"], input[placeholder*="Category"]');
      if (categoryInput) {
        await categoryInput.type(data.category.ebayCategoryName, { delay: 30 });
        await sleep(1500);
        // Click the first matching suggestion
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(1000);
      }
    }
  } catch (err: any) {
    logger.debug('Category selection flow', { error: err.message });
  }

  await takeDebugScreenshot(page, `after-category-${data.id1688}`);

  // Step 4: Upload photos
  logger.info('Step 4: Uploading photos...');
  try {
    const imagePaths = await downloadProductImages(
      data.galleryImageUrls.map((url, i) => ({ imageUrl: url, sortOrder: i })),
      data.id1688,
    );

    if (imagePaths.length > 0) {
      // Look for photo upload area — try file input first
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        // Upload all images at once if input accepts multiple
        const acceptsMultiple = await page.evaluate((el: Element) => (el as HTMLInputElement).multiple, fileInput);
        if (acceptsMultiple) {
          await fileInput.uploadFile(...imagePaths);
        } else {
          // Upload one at a time
          await fileInput.uploadFile(imagePaths[0]);
          for (let i = 1; i < imagePaths.length; i++) {
            await sleep(2000);
            const nextInput = await page.$('input[type="file"]');
            if (nextInput) await nextInput.uploadFile(imagePaths[i]);
          }
        }
        logger.info(`Uploaded ${imagePaths.length} images`);
        await sleep(3000); // Wait for upload processing
      } else {
        // Try drag-drop or other upload mechanisms
        logger.warn('No file input found for photo upload — photos may need manual upload');
        // Try clicking "Add photos" button which may reveal the input
        const addPhotoClicked = await clickButtonByText(page, 'Add photo', 3000);
        if (!addPhotoClicked) await clickButtonByText(page, 'Upload', 3000);
        await sleep(1000);
        const fileInputAfterClick = await page.$('input[type="file"]');
        if (fileInputAfterClick) {
          await fileInputAfterClick.uploadFile(...imagePaths);
          logger.info(`Uploaded ${imagePaths.length} images after clicking add button`);
          await sleep(3000);
        }
      }
    }

    cleanupTempImages(data.id1688);
  } catch (err: any) {
    logger.warn('Photo upload issue', { error: err.message });
    cleanupTempImages(data.id1688);
  }

  await takeDebugScreenshot(page, `after-photos-${data.id1688}`);

  // Step 5: Fill title
  logger.info('Step 5: Setting title...');
  try {
    // Look for title input by various selectors
    const titleInput = await page.$(
      'input[name="title"], input[aria-label*="itle"], input[id*="title"], input[placeholder*="itle"]'
    );
    if (titleInput) {
      await titleInput.click({ clickCount: 3 });
      await titleInput.type(data.title, { delay: 20 });
      logger.info('Title set');
    } else {
      logger.warn('Title input not found — may already be filled from search');
    }
  } catch (err: any) {
    logger.debug('Title fill', { error: err.message });
  }

  // Step 6: Fill item specifics
  logger.info('Step 6: Filling item specifics...');
  for (const [key, value] of Object.entries(data.itemSpecifics)) {
    try {
      // Try to find the field by its label text
      const filled = await page.evaluate((k: string, v: string) => {
        // Find labels or field containers with this text
        const allLabels = Array.from(document.querySelectorAll('label, [class*="label"], [class*="Label"]'));
        for (const label of allLabels) {
          if (label.textContent?.includes(k)) {
            // Find associated input, select, or button
            const parent = label.closest('[class*="field"], [class*="Field"], [class*="group"], [class*="Group"]') || label.parentElement;
            if (!parent) continue;

            const input = parent.querySelector('input:not([type="hidden"]):not([type="file"]), select, textarea');
            if (input) {
              if (input.tagName === 'SELECT') {
                const select = input as HTMLSelectElement;
                const option = Array.from(select.options).find(o =>
                  o.textContent?.toLowerCase().includes(v.toLowerCase())
                );
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                  return `select:${k}=${v}`;
                }
              } else {
                const inp = input as HTMLInputElement;
                inp.focus();
                inp.value = v;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return `input:${k}=${v}`;
              }
            }

            // Try clicking a button/dropdown to open options
            const btn = parent.querySelector('button, [role="combobox"], [role="listbox"]');
            if (btn) {
              (btn as HTMLElement).click();
              return `clicked-dropdown:${k}`;
            }
          }
        }
        return null;
      }, key, value);

      if (filled) {
        logger.debug('Set item specific', { key, value, method: filled });
        await sleep(300);
      } else {
        logger.debug('Could not find field for item specific', { key, value });
      }
    } catch (err: any) {
      logger.debug('Item specific fill error', { key, error: err.message });
    }
  }

  await takeDebugScreenshot(page, `after-specifics-${data.id1688}`);

  // Step 7: Set condition
  logger.info('Step 7: Setting condition...');
  try {
    // eBay condition is usually a dropdown or radio selection
    const conditionMap: Record<number, string> = {
      1000: 'New with tags',
      1500: 'New without tags',
      3000: 'Used',
    };
    const conditionText = conditionMap[data.conditionId] || 'New without tags';

    // Try to find and set condition
    await page.evaluate((text: string) => {
      // Look for condition options (radio buttons, dropdown, etc.)
      const elements = Array.from(document.querySelectorAll(
        '[class*="condition"] button, [class*="condition"] input, [class*="Condition"] button, [class*="Condition"] input, [role="radio"], [role="option"]'
      ));
      for (const el of elements) {
        if (el.textContent?.toLowerCase().includes(text.toLowerCase())) {
          (el as HTMLElement).click();
          return;
        }
      }
    }, conditionText);
  } catch (err: any) {
    logger.debug('Condition set', { error: err.message });
  }

  // Step 8: Set price
  logger.info('Step 8: Setting price...');
  try {
    const priceInput = await page.$(
      'input[name="price"], input[aria-label*="rice"], input[id*="price"], input[placeholder*="rice"]'
    );
    if (priceInput) {
      await priceInput.click({ clickCount: 3 });
      await priceInput.type(String(data.price), { delay: 30 });
      logger.info(`Price set: $${data.price}`);
    }
  } catch (err: any) {
    logger.debug('Price fill', { error: err.message });
  }

  // Step 9: Set quantity
  logger.info('Step 9: Setting quantity...');
  try {
    const qtyInput = await page.$(
      'input[name="quantity"], input[aria-label*="uantity"], input[id*="quantity"]'
    );
    if (qtyInput) {
      await qtyInput.click({ clickCount: 3 });
      await qtyInput.type(String(data.quantity), { delay: 30 });
      logger.info(`Quantity set: ${data.quantity}`);
    }
  } catch (err: any) {
    logger.debug('Quantity fill', { error: err.message });
  }

  // Step 10: Set description
  logger.info('Step 10: Setting description...');
  try {
    // eBay description editor may be an iframe or contenteditable div
    const descSet = await page.evaluate((html: string) => {
      // Try contenteditable div
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      for (const el of editables) {
        if (el.closest('[class*="description"], [class*="Description"], [id*="description"]') || editables.length === 1) {
          (el as HTMLElement).innerHTML = html;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return 'contenteditable';
        }
      }

      // Try textarea
      const textareas = Array.from(document.querySelectorAll('textarea'));
      for (const ta of textareas) {
        const label = ta.closest('label') || document.querySelector(`label[for="${ta.id}"]`);
        if (label?.textContent?.toLowerCase().includes('description') || textareas.length <= 2) {
          ta.value = html;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return 'textarea';
        }
      }

      return null;
    }, data.description);

    if (descSet) {
      logger.info('Description set via', { method: descSet });
    } else {
      // Try iframe approach (TinyMCE-style)
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const body = await frame.$('body[contenteditable="true"]');
          if (body) {
            await frame.evaluate((html: string) => {
              document.body.innerHTML = html;
            }, data.description);
            logger.info('Description set via iframe');
            break;
          }
        } catch { /* skip frame */ }
      }
    }
  } catch (err: any) {
    logger.debug('Description fill', { error: err.message });
  }

  await takeDebugScreenshot(page, `after-description-${data.id1688}`);

  // Step 11: Set shipping/return/payment policies
  logger.info('Step 11: Setting business policies...');
  // These may be pre-set if eBay business policies are configured on the account
  // Try to find and select them
  for (const [policyType, policyName] of [
    ['shipping', data.businessPolicies.shipping],
    ['return', data.businessPolicies.return],
    ['payment', data.businessPolicies.payment],
  ]) {
    try {
      await page.evaluate((type: string, name: string) => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
          const label = sel.closest('label') || document.querySelector(`label[for="${sel.id}"]`);
          const container = sel.closest('[class*="' + type + '"], [class*="' + type.charAt(0).toUpperCase() + type.slice(1) + '"]');
          if (label?.textContent?.toLowerCase().includes(type) || container) {
            const option = Array.from(sel.options).find(o => o.textContent?.includes(name));
            if (option) {
              sel.value = option.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      }, policyType, policyName);
    } catch (err: any) {
      logger.debug(`${policyType} policy`, { error: err.message });
    }
  }

  // Step 12: Scroll down and take pre-submit screenshot
  await scrollToBottom(page);
  await sleep(1000);
  await takeDebugScreenshot(page, `pre-submit-${data.id1688}`);

  // Log all buttons visible on the page for debugging
  const buttons = await getPageButtons(page);
  logger.info('Buttons on page before submit:', { buttons });

  // Step 13: Submit listing (unless dry-run)
  if (dryRun) {
    logger.info('DRY RUN — not submitting. Form is filled.');
    return null;
  }

  logger.info('Step 13: Submitting listing...');
  const submitClicked =
    await clickButtonByText(page, 'List it', 5000) ||
    await clickButtonByText(page, 'Submit', 5000) ||
    await clickButtonByText(page, 'Publish', 5000);

  if (!submitClicked) {
    logger.warn('Could not find submit button');
    await takeDebugScreenshot(page, `no-submit-btn-${data.id1688}`);
    return null;
  }

  // Wait for listing confirmation
  await sleep(10000);
  await takeDebugScreenshot(page, `after-submit-${data.id1688}`);

  // Step 14: Extract eBay item ID from confirmation page
  const itemId = await page.evaluate(() => {
    const text = document.body.innerText;
    // Look for patterns like item number or /itm/ URL
    const urlMatch = window.location.href.match(/\/itm\/(\d+)/);
    if (urlMatch) return urlMatch[1];

    const textMatch = text.match(/(?:item|listing)\s*(?:number|ID|#)?\s*:?\s*(\d{12,14})/i);
    if (textMatch) return textMatch[1];

    // Check for success indicators
    const hasSuccess = text.toLowerCase().includes('listed') || text.toLowerCase().includes('congratulations');
    if (hasSuccess) {
      // Try to find any 12-14 digit number on the page
      const numMatch = text.match(/\b(\d{12,14})\b/);
      if (numMatch) return numMatch[1];
    }

    return null;
  });

  if (itemId) {
    logger.info(`Listing created! eBay item ID: ${itemId}`);
  } else {
    logger.warn('Could not extract eBay item ID from confirmation page');
    logger.info('Current URL:', { url: page.url() });
  }

  return itemId;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find((_, i, a) => a[i - 1] === '--limit') || '5', 10);
  const categoryFilter = args.find((_, i, a) => a[i - 1] === '--category');
  const productIdArg = args.find((_, i, a) => a[i - 1] === '--product-id');
  const dryRun = args.includes('--dry-run');
  const singleOnly = args.includes('--single-only');
  const headless = process.env.HEADLESS === '1';

  logger.info('Task 3: eBay Single Listing', {
    limit, categoryFilter, productIdArg, dryRun, singleOnly, headless,
  });

  await initSchema();

  // Fetch products
  let products;
  if (productIdArg) {
    const product = await getProductById(parseInt(productIdArg, 10));
    if (!product) {
      logger.error('Product not found', { productId: productIdArg });
      closeDatabase();
      return;
    }
    products = [product];
  } else {
    products = await getProductsForEbayExport(limit, categoryFilter, true);
  }

  if (products.length === 0) {
    logger.info('No products to list');
    closeDatabase();
    return;
  }

  logger.info(`Found ${products.length} products to process`);

  // Launch browser
  const browser = await launchBrowser(headless);
  const page = await browser.newPage();
  await loadCookies(page);
  await ensureLoggedIn(page);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const product of products) {
    const data = prepareListingData(product);
    if (!data) {
      skipped++;
      continue;
    }

    // Phase 1: skip multi-variant products unless explicitly allowed
    if (singleOnly && data.hasVariants) {
      logger.info('Skipping multi-variant product (Phase 1)', { id1688: data.id1688 });
      skipped++;
      continue;
    }

    try {
      const ebayItemId = await listSingleProduct(page, data, dryRun);

      if (ebayItemId) {
        await upsertPlatformListing(data.id1688, 'ebay', ebayItemId);
        await markProductAsListed(data.productId);
        succeeded++;
      } else if (dryRun) {
        succeeded++;
      } else {
        // No item ID extracted but didn't throw — ambiguous result
        logger.warn('Listing may have succeeded but no item ID extracted', { id1688: data.id1688 });
        succeeded++;
      }
    } catch (err: any) {
      logger.error(`Failed to list product ${data.id1688}`, { error: err.message });
      await takeDebugScreenshot(page, `error-${data.id1688}`);
      await markProductAsListFailed(data.productId);
      failed++;
    }

    // Rate limiting: random delay between listings (15-30s)
    if (products.indexOf(product) < products.length - 1) {
      const delay = 15000 + Math.random() * 15000;
      logger.info(`Waiting ${Math.round(delay / 1000)}s before next listing...`);
      await sleep(delay);
    }
  }

  logger.info('=== Task 3 Complete ===', { succeeded, failed, skipped, total: products.length });

  await browser.close();
  closeDatabase();
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
