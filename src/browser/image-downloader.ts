/**
 * Downloads product images from URLs to local temp directory
 * for upload to eBay's listing form.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { ensureDirectoryExists } from '../utils/helpers';

const logger = createChildLogger('image-downloader');

function downloadFile(url: string, destPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, { timeout: 30000 }, (response) => {
      // Follow redirects
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

export async function downloadProductImages(
  images: Array<{ imageUrl: string; sortOrder: number }>,
  productId: string,
): Promise<string[]> {
  const tempDir = path.join(config.paths.data, 'temp-images', productId);
  ensureDirectoryExists(tempDir);

  const localPaths: string[] = [];

  for (let i = 0; i < images.length && i < 12; i++) {
    const img = images[i];
    const ext = path.extname(new URL(img.imageUrl).pathname) || '.jpg';
    const filename = `img-${i}${ext}`;
    const destPath = path.join(tempDir, filename);

    try {
      await downloadFile(img.imageUrl, destPath);
      localPaths.push(destPath);
      logger.debug('Downloaded image', { url: img.imageUrl.substring(0, 80), dest: filename });
    } catch (err: any) {
      logger.warn('Failed to download image', { url: img.imageUrl.substring(0, 80), error: err.message });
    }
  }

  logger.info(`Downloaded ${localPaths.length}/${images.length} images`, { productId });
  return localPaths;
}

export function cleanupTempImages(productId: string): void {
  const tempDir = path.join(config.paths.data, 'temp-images', productId);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    logger.debug('Cleaned up temp images', { productId });
  }
}
