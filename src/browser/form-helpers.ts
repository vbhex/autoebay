/**
 * Puppeteer form interaction helpers for eBay's SPA listing form.
 */

import path from 'path';
import { Page } from 'puppeteer';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists, sleep } from '../utils/helpers';

const logger = createChildLogger('form-helpers');

export async function waitAndClick(
  page: Page,
  selector: string,
  timeout = 10000,
): Promise<void> {
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
}

export async function waitAndType(
  page: Page,
  selector: string,
  text: string,
  clearFirst = true,
): Promise<void> {
  await page.waitForSelector(selector, { timeout: 10000 });
  if (clearFirst) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
  }
  await page.type(selector, text, { delay: 30 });
}

/**
 * Find an input or select by its associated label text (case-insensitive).
 * Works with eBay's SPA where labels use for/id or wrapping patterns.
 */
export async function findFieldByLabel(
  page: Page,
  labelText: string,
): Promise<string | null> {
  const fieldRef = await page.evaluate((text: string) => {
    const labels = Array.from(document.querySelectorAll('label'));
    for (const label of labels) {
      if (label.textContent?.toLowerCase().includes(text.toLowerCase())) {
        // Check for `for` attribute
        if (label.htmlFor) {
          const el = document.getElementById(label.htmlFor);
          if (el) return `#${label.htmlFor}`;
        }
        // Check for wrapped input/select
        const input = label.querySelector('input, select, textarea');
        if (input && input.id) return `#${input.id}`;
        if (input) return null; // found but no ID
      }
    }
    return null;
  }, labelText);

  return fieldRef;
}

/**
 * Find and click a button by its visible text content.
 */
export async function clickButtonByText(
  page: Page,
  text: string,
  timeout = 10000,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (t: string) => Array.from(document.querySelectorAll('button, [role="button"], a')).some(
        b => b.textContent?.toLowerCase().includes(t.toLowerCase())
      ),
      { timeout },
      text,
    );

    const clicked = await page.evaluate((t: string) => {
      const elements = Array.from(document.querySelectorAll('button, [role="button"], a'));
      const el = elements.find(b => b.textContent?.toLowerCase().includes(t.toLowerCase()));
      if (el) { (el as HTMLElement).click(); return el.textContent?.trim() || true; }
      return false;
    }, text);

    if (clicked) {
      logger.debug('Clicked button', { text, matched: clicked });
      return true;
    }
  } catch {
    logger.debug('Button not found', { text });
  }
  return false;
}

/**
 * Select a value from a custom dropdown (click to open, then click option).
 */
export async function selectDropdownValue(
  page: Page,
  triggerSelector: string,
  value: string,
): Promise<boolean> {
  try {
    await page.click(triggerSelector);
    await sleep(500);

    const selected = await page.evaluate((val: string) => {
      // Look for options in dropdowns, listboxes, or menus
      const options = Array.from(document.querySelectorAll(
        '[role="option"], [role="listbox"] li, .menu-item, [class*="option"], [class*="dropdown"] li'
      ));
      const match = options.find(
        o => o.textContent?.toLowerCase().includes(val.toLowerCase())
      );
      if (match) { (match as HTMLElement).click(); return true; }
      return false;
    }, value);

    return selected;
  } catch {
    return false;
  }
}

export async function takeDebugScreenshot(
  page: Page,
  name: string,
): Promise<string> {
  ensureDirectoryExists(config.paths.logs);
  const filename = `task3-${name}-${Date.now()}.png`;
  const filePath = path.join(config.paths.logs, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  logger.debug('Screenshot saved', { path: filePath });
  return filePath;
}

/**
 * Wait for the page URL to contain a specific pattern.
 */
export async function waitForUrlPattern(
  page: Page,
  pattern: string,
  timeout = 30000,
): Promise<void> {
  await page.waitForFunction(
    (p: string) => window.location.href.includes(p),
    { timeout },
    pattern,
  );
}

/**
 * Scroll to bottom of page (useful to reveal lazy-loaded elements).
 */
export async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
}

/**
 * Get all visible text on the page for debugging.
 */
export async function getPageButtons(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="button"]'))
      .map(b => b.textContent?.trim())
      .filter(Boolean) as string[]
  );
}
