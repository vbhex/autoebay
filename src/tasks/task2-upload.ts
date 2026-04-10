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
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists, sleep } from '../utils/helpers';
import { launchBrowser, loadCookies, loginToEbay, ensureLoggedIn } from '../browser/browser-utils';

const logger = createChildLogger('task2-upload');

async function uploadCSV(page: any, csvPath: string): Promise<void> {
  logger.info('Setting language to English...');
  // Navigate to English eBay first to ensure UI is in English
  await page.goto('https://www.ebay.com/sl/prelist/home', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1000);

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
  const chooseClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent?.toLowerCase().includes('choose file'));
    if (btn) { (btn as HTMLButtonElement).click(); return btn.textContent?.trim(); }
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

    logger.info('Waiting for upload to process...');
    await sleep(15000);
    logger.info('Upload submitted');
  } else {
    logger.warn('File chooser not intercepted — trying uploadFile fallback...');
    try {
      // Try multiple selectors to find the file input
      let fileInput = await page.$('input#file-input');
      if (!fileInput) {
        fileInput = await page.$('input[type="file"]');
      }
      if (!fileInput) {
        // Search all inputs for file type
        fileInput = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          return inputs.find(i => i.type === 'file') || null;
        }).then((el: any) => el ? page.$(el) : null);
      }

      if (fileInput) {
        await fileInput.uploadFile(csvPath);
        logger.info('uploadFile fallback succeeded');
        await sleep(15000);
      } else {
        throw new Error('File input element not found');
      }
    } catch (e: any) {
      logger.warn('uploadFile fallback failed:', { error: e.message });
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

  const browser = await launchBrowser(headless);
  const page = await browser.newPage();
  await loadCookies(page);

  try {
    if (isLoginOnly) {
      await loginToEbay(page);
      logger.info('Login-only mode complete');
    } else {
      await ensureLoggedIn(page);

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
