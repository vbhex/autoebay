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
  logger.info('Navigating to eBay reports/uploads page...');
  await page.goto('https://www.ebay.com/sh/reports/uploads', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);

  await page.screenshot({ path: path.join(config.paths.logs, 'reports-page.png'), fullPage: true });

  // Step 1: Wait for "Upload template" button to appear
  logger.info('Waiting for Upload template button...');
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.toLowerCase().includes('upload template')),
      { timeout: 15000 }
    );
  } catch {
    logger.warn('Upload template button not found, proceeding anyway');
  }

  const allBtnTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean)
  );
  logger.info('Buttons on page:', { buttons: allBtnTexts });

  // Step 2: Set up file chooser listener BEFORE clicking anything
  // (Puppeteer requires the listener to be registered before the click that triggers the picker)
  const fileChooserPromise = new Promise<any>(resolve => page.once('filechooser', resolve));
  const fileChooserTimeout = sleep(25000).then(() => null);

  // Step 3: Click "Upload template" to open the eBay dialog
  const uploadClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent?.toLowerCase().includes('upload template'));
    if (btn) { (btn as HTMLButtonElement).click(); return btn.textContent?.trim(); }
    return null;
  });
  logger.info('Clicked Upload template:', { text: uploadClicked });

  // Step 4: Wait for the "Upload File" dialog to appear with the "Choose file" button
  await sleep(1500);
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.toLowerCase().includes('choose file')),
      { timeout: 10000 }
    );
    logger.info('Upload File dialog is open with Choose file button');
  } catch {
    logger.warn('Choose file button not found in dialog');
  }

  // Step 5: Click "Choose file" button to open the native file picker
  // This triggers the filechooser event that Puppeteer can intercept
  const chooseClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent?.toLowerCase().includes('choose file'));
    if (btn) { (btn as HTMLButtonElement).click(); return btn.textContent?.trim(); }
    // Fallback: click the file input directly
    const inp = document.getElementById('file-input') as HTMLInputElement;
    if (inp) { inp.click(); return 'clicked file-input directly'; }
    return null;
  });
  logger.info('Clicked Choose file:', { text: chooseClicked });

  // Step 6: Intercept the file chooser and provide the CSV path
  const fileChooser = await Promise.race([fileChooserPromise, fileChooserTimeout]);

  if (fileChooser) {
    logger.info('File chooser intercepted — accepting CSV...');
    await fileChooser.accept([csvPath]);
    logger.info('File set via chooser');
    await sleep(3000);

    await page.screenshot({ path: path.join(config.paths.logs, 'after-file-selected.png'), fullPage: true });

    // Step 7: Wait for upload to complete (eBay processes the file automatically after selection)
    logger.info('Waiting for upload to process...');
    await sleep(15000);
    logger.info('Upload submitted');
  } else {
    // Fallback: use Puppeteer's setInputFiles directly on the file input
    logger.warn('File chooser not intercepted — trying setInputFiles fallback...');
    try {
      await page.focus('input#file-input');
      await (page as any).setInputFiles('input#file-input', csvPath);
      logger.info('setInputFiles fallback succeeded');
      await sleep(15000);
    } catch (e: any) {
      logger.warn('setInputFiles fallback failed:', { error: e.message });
      logger.info('CSV file ready for manual upload:', { csvPath });
    }
  }

  await page.screenshot({ path: path.join(config.paths.logs, 'upload-result.png'), fullPage: true });
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
