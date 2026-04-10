/**
 * Shared browser infrastructure for eBay Puppeteer automation.
 * Extracted from task2-upload.ts for reuse across task2 (CSV upload) and task3 (single listing).
 */

import fs from 'fs';
import path from 'path';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists, sleep } from '../utils/helpers';

puppeteerExtra.use(StealthPlugin());

const logger = createChildLogger('browser-utils');

const COOKIES_FILE = path.join(config.paths.data, 'ebay-cookies.json');

export async function launchBrowser(headless = false) {
  logger.info('Launching browser...', { headless });
  const browser = await puppeteerExtra.launch({
    headless,
    protocolTimeout: 0,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
  });
  return browser;
}

export async function saveCookies(page: any): Promise<void> {
  ensureDirectoryExists(config.paths.data);
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  logger.info('Cookies saved', { file: COOKIES_FILE });
}

export async function loadCookies(page: any): Promise<boolean> {
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

export async function loginToEbay(page: any): Promise<void> {
  logger.info('Navigating to eBay login...');
  try {
    await page.goto(config.ebay.sellerLoginUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  } catch (err: any) {
    logger.warn('Navigation timeout, continuing anyway', { error: err.message });
  }
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
  logger.info('If you see a 2FA prompt, complete it now (browser is visible)');
  await sleep(30000); // 30 seconds for user to complete 2FA

  // Take screenshot
  ensureDirectoryExists(config.paths.logs);
  await page.screenshot({
    path: path.join(config.paths.logs, 'login-result.png'),
    fullPage: true,
  });

  await saveCookies(page);
  logger.info('Login complete');
}

export async function ensureLoggedIn(page: any): Promise<void> {
  try {
    await page.goto(config.ebay.sellerHubUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  } catch (err: any) {
    logger.warn('Navigation timeout to seller hub, continuing', { error: err.message });
  }
  await sleep(2000);

  if (page.url().includes('signin') || page.url().includes('SignIn')) {
    logger.info('Not logged in, performing login...');
    await loginToEbay(page);
  } else {
    logger.info('Already logged in to eBay');
  }
}
