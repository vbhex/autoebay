/**
 * Debug script: See what page eBay actually shows during login
 */

import path from 'path';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists, sleep } from '../utils/helpers';
import { launchBrowser, loadCookies } from '../browser/browser-utils';

const logger = createChildLogger('debug-login');

async function main() {
  const browser = await launchBrowser(false); // visible
  const page = await browser.newPage();
  await loadCookies(page);

  try {
    logger.info('Navigating to eBay seller hub...');
    await page.goto(config.ebay.sellerHubUrl, { waitUntil: 'networkidle2', timeout: 120000 });
    await sleep(2000);

    const url = page.url();
    logger.info('Current URL:', { url });

    // Get page title
    const title = await page.title();
    logger.info('Page title:', { title });

    // Get all input fields
    const inputs = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('input, button, [role="button"]'));
      return items.map(el => ({
        tag: el.tagName,
        type: (el as any).type,
        id: el.id,
        name: (el as any).name,
        placeholder: (el as any).placeholder,
        textContent: el.textContent?.substring(0, 50),
        class: el.className?.substring(0, 100),
      }));
    });

    logger.info('Found elements:', { count: inputs.length });
    inputs.slice(0, 20).forEach((inp, i) => {
      logger.info(`  [${i}]`, inp);
    });

    // Take screenshot
    ensureDirectoryExists(config.paths.logs);
    await page.screenshot({ path: path.join(config.paths.logs, 'debug-login.png'), fullPage: true });
    logger.info('Screenshot saved to logs/debug-login.png');

    // Save HTML
    const html = await page.content();
    const htmlFile = path.join(config.paths.logs, 'debug-login.html');
    require('fs').writeFileSync(htmlFile, html);
    logger.info('HTML saved', { file: htmlFile, size: html.length });

  } finally {
    await browser.close();
    logger.info('Browser closed');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
