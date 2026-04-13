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
  logger.info('Navigating to eBay Seller Hub uploads page...');
  await page.goto('https://www.ebay.com/sh/reports/uploads', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  // Close any welcome modal by pressing Escape
  await page.keyboard.press('Escape');
  await sleep(500);

  await page.screenshot({ path: path.join(config.paths.logs, 'reports-page.png'), fullPage: false });

  // Step 1: Find the file input that's already in the DOM (eBay keeps it hidden)
  // Try direct approach first — input[type="file"] exists before clicking anything
  logger.info('Looking for file input in DOM...');
  let fileInput = await page.$('input[type="file"]');

  if (fileInput) {
    logger.info('Found file input directly — uploading CSV without dialog...');
    await fileInput.uploadFile(csvPath);
    logger.info('File set via direct uploadFile');
    await sleep(2000);
    await page.screenshot({ path: path.join(config.paths.logs, 'after-file-set.png'), fullPage: false });
  } else {
    // Step 2: Set up file chooser interception BEFORE clicking the button
    logger.info('No file input found — will use filechooser interception...');
    await page.setRequestInterception(false);

    const fileChooserPromise = new Promise<any>((resolve) => {
      page.once('filechooser', resolve);
    });

    // Click "Upload template" or equivalent button (text may be in Chinese 上传模板 or English)
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      // Look for upload-related button text in English or Chinese
      const btn = btns.find(b => {
        const t = b.textContent?.toLowerCase() || '';
        return t.includes('upload template') || t.includes('上传模板') || t.includes('upload file') || t.includes('上传文件');
      });
      if (btn) { (btn as HTMLElement).click(); return btn.textContent?.trim(); }
      return null;
    });
    logger.info('Clicked upload button:', { text: clicked });

    await sleep(2000);

    // Wait for Choose File button to appear in the dialog
    const chooseClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => {
        const t = b.textContent?.toLowerCase() || '';
        return t.includes('choose file') || t.includes('选择文件') || t.includes('browse');
      });
      if (btn) { (btn as HTMLButtonElement).click(); return btn.textContent?.trim(); }
      // Also try clicking any file input directly
      const inp = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (inp) { inp.click(); return 'clicked file input'; }
      return null;
    });
    logger.info('Clicked choose file:', { text: chooseClicked });

    // Wait up to 15s for file chooser
    const fileChooser = await Promise.race([
      fileChooserPromise,
      sleep(15000).then(() => null),
    ]);

    if (fileChooser) {
      logger.info('File chooser intercepted — accepting CSV...');
      await fileChooser.accept([csvPath]);
      logger.info('File accepted');
    } else {
      // Last resort: find file input that may have appeared after clicking
      fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(csvPath);
        logger.info('uploadFile fallback after dialog succeeded');
      } else {
        logger.warn('No file chooser or input found — upload could not proceed');
        logger.info('CSV file ready for manual upload:', { csvPath });
        await page.screenshot({ path: path.join(config.paths.logs, 'upload-failed.png'), fullPage: false });
        return;
      }
    }
  }

  await sleep(2000);
  await page.screenshot({ path: path.join(config.paths.logs, 'after-file-selected.png'), fullPage: false });

  // Step 3: Click "Upload" / submit button to confirm
  const submitClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => {
      const t = b.textContent?.toLowerCase() || '';
      return (t.includes('upload') || t.includes('上传') || t.includes('submit')) && !t.includes('template');
    });
    if (btn) { (btn as HTMLButtonElement).click(); return btn.textContent?.trim(); }
    return null;
  });
  logger.info('Clicked submit/upload button:', { text: submitClicked });

  await sleep(3000);
  await page.screenshot({ path: path.join(config.paths.logs, 'upload-submitted.png'), fullPage: false });

  logger.info('Waiting for upload to process...');
  await sleep(15000);

  await page.screenshot({ path: path.join(config.paths.logs, 'upload-result.png'), fullPage: false });
  logger.info('Upload flow complete');
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
