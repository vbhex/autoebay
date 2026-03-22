import fs from 'fs';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function isBannedBrand(text: string): boolean {
  const bannedBrands = [
    'apple', 'iphone', 'ipad', 'airpods', 'macbook',
    'samsung', 'galaxy',
    'sony', 'playstation',
    'bose', 'jbl', 'beats',
    'nike', 'adidas', 'puma', 'new balance', 'under armour',
    'gucci', 'louis vuitton', 'prada', 'hermes', 'chanel', 'dior',
    'coach', 'michael kors', 'kate spade', 'tory burch', 'burberry',
    'rolex', 'cartier', 'omega', 'tag heuer', 'breitling', 'tudor',
    'casio', 'seiko', 'citizen', 'fossil', 'tissot', 'swatch',
    'ray-ban', 'oakley', 'versace', 'dolce & gabbana',
    'pandora', 'tiffany', 'swarovski', 'david yurman',
    'north face', 'patagonia', 'columbia',
    'lululemon', 'victoria\'s secret',
    'huawei', 'xiaomi', 'oppo', 'vivo',
    'logitech', 'razer', 'corsair',
    'gopro', 'dji', 'canon', 'nikon',
    'dyson', 'marshall', 'sennheiser',
    'anker', 'baseus', 'remax',
  ];

  const lowerText = text.toLowerCase();
  return bannedBrands.some(brand => lowerText.includes(brand));
}

export function truncateToBytes(str: string, maxBytes: number): string {
  if (Buffer.byteLength(str, 'utf-8') <= maxBytes) return str;
  let truncated = str;
  while (Buffer.byteLength(truncated, 'utf-8') > maxBytes) {
    truncated = truncated.slice(0, -1);
  }
  return truncated;
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

export function roundPrice(price: number): number {
  if (price < 10) {
    return Math.ceil(price * 100) / 100;
  } else if (price < 100) {
    return Math.ceil(price * 10) / 10;
  } else {
    return Math.ceil(price);
  }
}

export function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
