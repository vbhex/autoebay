/**
 * Task 2: Upload CSV to eBay Seller Hub Reports.
 *
 * Uses Puppeteer to automate the upload process:
 * 1. Login to eBay (or load saved cookies)
 * 2. Navigate to Seller Hub → Reports → Uploads
 * 3. Upload CSV file
 * 4. Monitor upload status
 *
 * Usage:
 *   npm run task:login              # Save cookies only
 *   npm run task:upload             # Upload latest CSV
 *   npm run task:upload -- --file output/ebay-export-2026-03-22.csv
 */

import fs from 'fs';
import path from 'path';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists, sleep } from '../utils/helpers';

puppeteerExtra.use(StealthPlugin());

const logger = createChildLogger('task2-upload');

const COOKIES_FILE = path.join(config.paths.data, 'ebay-cookies.json');

async function saveCookies(page: any): Promise<void> {
  ensureDirectoryExists(config.paths.data);
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  logger.info('Cookies saved', { file: COOKIES_FILE });
}

async function loadCookies(page: any): Promise<boolean> {
  if (!fs.existsSync(COOKIES_FILE)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    await page.setCookie(...cookies);
    logger.info('Cookies loaded');
    return true;
  } catch {
    logger.warn('Failed to load cookies');
    return false;
  }
}

async function loginToEbay(page: any, saveOnly: boolean): Promise<void> {
  logger.info('Navigating to eBay login...');
  await page.goto(config.ebay.sellerLoginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2000);

  // Check if already logged in
  const url = page.url();
  if (!url.includes('signin') && !url.includes('SignIn')) {
    logger.info('Already logged in');
    await saveCookies(page);
    return;
  }

  // Enter username
  try {
    await page.waitForSelector('#userid', { timeout: 10000 });
    await page.type('#userid', config.ebay.username, { delay: 50 });
    await page.click('#signin-continue-btn');
    await sleep(2000);
  } catch (err: any) {
    logger.warn('Username field not found, may be on password page already');
  }

  // Enter password
  try {
    await page.waitForSelector('#pass', { timeout: 10000 });
    await page.type('#pass', config.ebay.password, { delay: 50 });
    await page.click('#sgnBt');
    await sleep(5000);
  } catch (err: any) {
    logger.warn('Password field not found');
  }

  // Wait for manual intervention if 2FA is needed
  logger.info('Waiting for login to complete (handle 2FA manually if needed)...');
  await sleep(10000);

  // Take screenshot
  ensureDirectoryExists(config.paths.logs);
  await page.screenshot({
    path: path.join(config.paths.logs, 'login-result.png'),
    fullPage: true,
  });

  await saveCookies(page);
  logger.info('Login complete');
}

async function uploadCSV(page: any, csvPath: string): Promise<void> {
  logger.info('Navigating to Seller Hub Reports...', { url: config.ebay.reportsUrl });
  await page.goto(config.ebay.reportsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);

  // Navigate to Uploads tab
  try {
    const uploadsTab = await page.$('a[href*="uploads"], button:has-text("Uploads")');
    if (uploadsTab) {
      await uploadsTab.click();
      await sleep(2000);
    }
  } catch {
    logger.info('Trying direct uploads URL...');
    await page.goto('https://www.ebay.com/sh/reports/uploads', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
  }

  // Screenshot current state
  await page.screenshot({
    path: path.join(config.paths.logs, 'reports-page.png'),
    fullPage: true,
  });

  // Look for upload button/input
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    logger.info('Found file input, uploading CSV...');
    await fileInput.uploadFile(csvPath);
    await sleep(3000);

    // Look for submit/upload button
    const submitBtn = await page.$('button[type="submit"], button:has-text("Upload")');
    if (submitBtn) {
      await submitBtn.click();
      logger.info('Upload submitted');
      await sleep(5000);
    }
  } else {
    logger.warn('No file input found on page. Manual upload may be required.');
    logger.info('CSV file ready for manual upload:', { csvPath });
  }

  await page.screenshot({
    path: path.join(config.paths.logs, 'upload-result.png'),
    fullPage: true,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isLoginOnly = args.includes('--login');
  const specificFile = args.find((_, i, a) => a[i - 1] === '--file');

  const headless = process.env.HEADLESS === '1';

  logger.info('Launching browser...', { headless, loginOnly: isLoginOnly });

  const browser = await puppeteerExtra.launch({
    headless,
    protocolTimeout: 0,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();
  await loadCookies(page);

  try {
    if (isLoginOnly) {
      await loginToEbay(page, true);
      logger.info('Login-only mode complete');
    } else {
      // Check if we're logged in
      await page.goto(config.ebay.sellerHubUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(2000);

      if (page.url().includes('signin') || page.url().includes('SignIn')) {
        logger.info('Not logged in, performing login...');
        await loginToEbay(page, false);
      }

      // Find CSV file to upload
      let csvPath: string;
      if (specificFile) {
        csvPath = path.resolve(specificFile);
      } else {
        const outputDir = config.paths.output;
        if (!fs.existsSync(outputDir)) {
          logger.error('No output directory found');
          return;
        }
        const files = fs.readdirSync(outputDir)
          .filter(f => f.startsWith('ebay-export-') && f.endsWith('.csv'))
          .sort()
          .reverse();

        if (files.length === 0) {
          logger.error('No CSV files found in output directory');
          return;
        }
        csvPath = path.join(outputDir, files[0]);
      }

      if (!fs.existsSync(csvPath)) {
        logger.error('CSV file not found', { csvPath });
        return;
      }

      logger.info('Uploading CSV...', { file: csvPath });
      await uploadCSV(page, csvPath);
    }
  } finally {
    await browser.close();
    logger.info('Browser closed');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
