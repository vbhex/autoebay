/**
 * eBay category mapping from 1688 source categories.
 *
 * Maps CLI category names (used in 1688_source.products.category)
 * to eBay leaf category IDs and metadata needed for CSV generation.
 */

export interface EbayCategoryInfo {
  ebayCategoryId: number;
  ebayCategoryName: string;
  conditionId: number;         // 1000 = New with tags, 1500 = New without tags, 3000 = Used
  variationDimensions: string[]; // e.g. ['Color', 'Size']
  itemSpecifics: Record<string, string>; // default item specifics for the category
}

export const EBAY_CATEGORY_MAP: Record<string, EbayCategoryInfo> = {
  // ── Watches ────────────────────────────────────────────────────────
  'quartz watches':   { ebayCategoryId: 31387, ebayCategoryName: 'Wristwatches', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Wristwatch', Department: 'Unisex Adult', Movement: 'Quartz', Display: 'Analog', 'Country/Region of Manufacture': 'China' } },
  'fashion watches':  { ebayCategoryId: 31387, ebayCategoryName: 'Wristwatches', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Wristwatch', Department: 'Unisex Adult', Movement: 'Quartz', Display: 'Analog', 'Country/Region of Manufacture': 'China' } },
  'couple watches':   { ebayCategoryId: 31387, ebayCategoryName: 'Wristwatches', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Wristwatch', Department: 'Unisex Adult', Movement: 'Quartz', Display: 'Analog', 'Country/Region of Manufacture': 'China' } },
  'digital watches':  { ebayCategoryId: 31387, ebayCategoryName: 'Wristwatches', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Wristwatch', Department: 'Unisex Adult', Movement: 'Digital', Display: 'Digital', 'Country/Region of Manufacture': 'China' } },

  // ── Fashion Jewelry ────────────────────────────────────────────────
  'fashion earrings':   { ebayCategoryId: 50647,  ebayCategoryName: 'Fashion Earrings', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Drop/Dangle', 'Main Stone': 'No Stone', 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },
  'fashion bracelets':  { ebayCategoryId: 261987, ebayCategoryName: 'Fashion Bracelets & Charms', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Bangle', 'Main Stone': 'No Stone', 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },
  'fashion necklaces':  { ebayCategoryId: 155101, ebayCategoryName: 'Fashion Necklaces & Pendants', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Pendant', 'Main Stone': 'No Stone', 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },
  'fashion rings':      { ebayCategoryId: 67681,  ebayCategoryName: 'Fashion Rings', conditionId: 1500, variationDimensions: ['Color', 'Ring Size'], itemSpecifics: { 'Main Stone': 'No Stone', 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },
  'fashion anklets':    { ebayCategoryId: 261987, ebayCategoryName: 'Fashion Bracelets & Charms', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Anklet', 'Main Stone': 'No Stone', 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },

  // ── Sunglasses & Eyewear ──────────────────────────────────────────
  'polarized sunglasses': { ebayCategoryId: 179247, ebayCategoryName: 'Sunglasses', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Lens Technology': 'Polarized', 'Frame Material': 'Plastic', Protection: '100% UV', 'Country/Region of Manufacture': 'China' } },
  'sports sunglasses':    { ebayCategoryId: 179247, ebayCategoryName: 'Sunglasses', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Lens Technology': 'Polarized', 'Frame Material': 'Plastic', Protection: '100% UV', Style: 'Sport', 'Country/Region of Manufacture': 'China' } },
  'blue light glasses':   { ebayCategoryId: 180957, ebayCategoryName: 'Eyeglass Frames', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Lens Technology': 'Blue Light Filter', 'Frame Material': 'Plastic', 'Country/Region of Manufacture': 'China' } },
  'reading glasses':      { ebayCategoryId: 180957, ebayCategoryName: 'Eyeglass Frames', conditionId: 1500, variationDimensions: ['Color', 'Lens Strength'], itemSpecifics: { 'Frame Material': 'Plastic', 'Country/Region of Manufacture': 'China' } },

  // ── Hats & Caps ────────────────────────────────────────────────────
  'bucket hats':    { ebayCategoryId: 52382, ebayCategoryName: 'Hats', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Style: 'Bucket Hat', Department: 'Unisex Adults', Material: 'Cotton', 'Country/Region of Manufacture': 'China' } },
  'baseball caps':  { ebayCategoryId: 52382, ebayCategoryName: 'Hats', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Style: 'Baseball Cap', Department: 'Unisex Adults', Material: 'Cotton', 'Country/Region of Manufacture': 'China' } },
  'beanies':        { ebayCategoryId: 52382, ebayCategoryName: 'Hats', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Style: 'Beanie', Department: 'Unisex Adults', Material: 'Acrylic', 'Country/Region of Manufacture': 'China' } },
  'cowboy hats':    { ebayCategoryId: 52382, ebayCategoryName: 'Hats', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Style: 'Cowboy Hat', Department: 'Unisex Adults', 'Country/Region of Manufacture': 'China' } },

  // ── Bags & Wallets ─────────────────────────────────────────────────
  'waist packs':        { ebayCategoryId: 169285, ebayCategoryName: 'Backpacks, Bags & Briefcases', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Waist Bag/Fanny Pack', Material: 'Nylon', 'Country/Region of Manufacture': 'China' } },
  'coin purses':        { ebayCategoryId: 169285, ebayCategoryName: 'Backpacks, Bags & Briefcases', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Coin Purse', Material: 'Faux Leather', 'Country/Region of Manufacture': 'China' } },
  'fashion backpacks':  { ebayCategoryId: 169285, ebayCategoryName: 'Backpacks, Bags & Briefcases', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Backpack', Material: 'Nylon', 'Country/Region of Manufacture': 'China' } },
  'fashion wallets':    { ebayCategoryId: 169285, ebayCategoryName: 'Backpacks, Bags & Briefcases', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Wallet', Material: 'Faux Leather', 'Country/Region of Manufacture': 'China' } },

  // ── Hair Accessories ───────────────────────────────────────────────
  'hair claws':           { ebayCategoryId: 261786, ebayCategoryName: 'Hair Accessories', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Hair Claw', Material: 'Plastic', 'Country/Region of Manufacture': 'China' } },
  'hair pins':            { ebayCategoryId: 261786, ebayCategoryName: 'Hair Accessories', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Hair Pin', Material: 'Metal', 'Country/Region of Manufacture': 'China' } },
  'hair accessories set': { ebayCategoryId: 261786, ebayCategoryName: 'Hair Accessories', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Set', Material: 'Mixed', 'Country/Region of Manufacture': 'China' } },

  // ── Eyeglass Frames ──────────────────────────────────────────────
  'optical frames': { ebayCategoryId: 180957, ebayCategoryName: 'Eyeglass Frames', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Frame Material': 'Metal', 'Lens Technology': 'Standard', 'Country/Region of Manufacture': 'China' } },

  // ── Women's Shoes ────────────────────────────────────────────────
  'womens fashion shoes': { ebayCategoryId: 55793, ebayCategoryName: 'Women\'s Shoes', conditionId: 1500, variationDimensions: ['Color', 'US Shoe Size (Women\'s)'], itemSpecifics: { Department: 'Women', 'Country/Region of Manufacture': 'China' } },

  // ── Men's Shoes ──────────────────────────────────────────────────
  'mens casual shoes': { ebayCategoryId: 93427, ebayCategoryName: 'Men\'s Shoes', conditionId: 1500, variationDimensions: ['Color', 'US Shoe Size'], itemSpecifics: { Department: 'Men', Style: 'Casual Shoes', 'Country/Region of Manufacture': 'China' } },

  // ── Scarves ────────────────────────────────────────────────────────
  'silk scarves':   { ebayCategoryId: 45238, ebayCategoryName: 'Scarves & Wraps', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Scarf', Material: 'Silk', 'Country/Region of Manufacture': 'China' } },
  'winter scarves': { ebayCategoryId: 45238, ebayCategoryName: 'Scarves & Wraps', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Scarf', Material: 'Acrylic', 'Country/Region of Manufacture': 'China' } },

  // ── Belts ──────────────────────────────────────────────────────────
  'fashion belts': { ebayCategoryId: 2993, ebayCategoryName: 'Belts', conditionId: 1500, variationDimensions: ['Color', 'Size'], itemSpecifics: { Material: 'Faux Leather', 'Country/Region of Manufacture': 'China' } },

  // ── Gloves ─────────────────────────────────────────────────────────
  'fashion gloves': { ebayCategoryId: 105559, ebayCategoryName: 'Gloves & Mittens', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },

  // ── Suspenders & Braces ───────────────────────────────────────────
  'SuspendersBracesPostureCor': { ebayCategoryId: 105387, ebayCategoryName: 'Suspenders', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Department: 'Unisex Adults', Material: 'Elastic', 'Country/Region of Manufacture': 'China' } },

  // ── Ties & Tie Accessories ────────────────────────────────────────
  'Ties':              { ebayCategoryId: 15662, ebayCategoryName: 'Ties', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Necktie', Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },
  'TieSet':            { ebayCategoryId: 15662, ebayCategoryName: 'Ties', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Set', Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },
  'TieChains':         { ebayCategoryId: 10298, ebayCategoryName: 'Tie Clasps & Tacks', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },
  'TieClip':           { ebayCategoryId: 10298, ebayCategoryName: 'Tie Clasps & Tacks', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },
  'TieBucklesCufflinks': { ebayCategoryId: 137843, ebayCategoryName: 'Cufflinks', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },
  'TieClipsCufflinks': { ebayCategoryId: 137843, ebayCategoryName: 'Cufflinks', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { 'Base Metal': 'Alloy', 'Country/Region of Manufacture': 'China' } },

  // ── Handkerchiefs & Pocket Squares ────────────────────────────────
  'Handkerchiefs': { ebayCategoryId: 167902, ebayCategoryName: 'Handkerchiefs & Pocket Squares', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },
  'PocketSquares': { ebayCategoryId: 167902, ebayCategoryName: 'Handkerchiefs & Pocket Squares', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },

  // ── Sashes ────────────────────────────────────────────────────────
  'Sashes':        { ebayCategoryId: 86207, ebayCategoryName: 'Belts & Sashes', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Sash', Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },
  'sun scarves':   { ebayCategoryId: 45238, ebayCategoryName: 'Scarves & Wraps', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Type: 'Scarf', Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },

  // ── Cummerbunds ───────────────────────────────────────────────────
  'Cummerbunds': { ebayCategoryId: 105509, ebayCategoryName: 'Formal Ties & Cummerbunds', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Material: 'Polyester', 'Country/Region of Manufacture': 'China' } },

  // ── Collar Stays ──────────────────────────────────────────────────
  'CollarStays': { ebayCategoryId: 184594, ebayCategoryName: 'Collar Stays', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Material: 'Metal', 'Country/Region of Manufacture': 'China' } },

  // ── Leg Warmers / Knee Sleeves ─────────────────────────────────────
  'KneeSleeveLegWarmer': { ebayCategoryId: 163587, ebayCategoryName: 'Leg Warmers', conditionId: 1500, variationDimensions: ['Color'], itemSpecifics: { Material: 'Acrylic', 'Country/Region of Manufacture': 'China' } },

  // ── Sneakers ──────────────────────────────────────────────────────
  'sneakers': { ebayCategoryId: 15709, ebayCategoryName: 'Athletic Shoes', conditionId: 1500, variationDimensions: ['Color', 'US Shoe Size'], itemSpecifics: { Department: 'Unisex', Style: 'Sneakers', 'Country/Region of Manufacture': 'China' } },
};

export const EBAY_CATEGORIES = Object.keys(EBAY_CATEGORY_MAP);

export type ProductStatus =
  | 'imported'
  | 'csv_generated'
  | 'ebay_exported'
  | 'listed'
  | 'skipped';

export interface ProductEN {
  productId: number;
  titleEn: string;
  descriptionEn: string;
  specificationsEn: Array<{ name: string; value: string }>;
  priceUsd: number;
  aeCategory: string;
}

export interface ImageOk {
  id: number;
  productId: number;
  imageUrl: string;
  imageType: 'gallery' | 'description' | 'variant';
  sortOrder: number;
  passed: boolean;
}

export interface VariantEN {
  id?: number;
  productId: number;
  optionNameEn: string;
  optionValueEn: string;
  optionValueZh: string;
  priceUsd: number;
  colorFamily: string;
  sortOrder: number;
}

export interface ProductVariant {
  id: number;
  productId: number;
  variantNameZh: string;
  variantNameEn: string | null;
  sortOrder: number;
}

export interface VariantValue {
  id: number;
  variantId: number;
  valueNameZh: string;
  valueNameEn: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface VariantSku {
  id: number;
  productId: number;
  skuCode: string | null;
  variantValuesJson: Record<string, string>;
  priceCny: number;
  stock: number;
  available: boolean;
  imageUrl: string | null;
}

export interface ExportProduct {
  id: number;
  id1688: string;
  category: string;
  priceCny: number;
  en: ProductEN;
  images: ImageOk[];
  variants: Array<VariantEN & { priceCny: number }>;
  variantStructure?: Array<ProductVariant & { values: VariantValue[] }>;
  skus?: VariantSku[];
}
