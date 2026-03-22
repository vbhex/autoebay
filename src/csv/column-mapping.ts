/**
 * eBay Seller Hub Reports CSV column definitions.
 *
 * When uploading via Seller Hub Reports → Uploads → "Create new listings",
 * the CSV uses the "Action" column to determine what to do with each row.
 *
 * For File Exchange / Seller Hub Reports upload format:
 * https://pages.ebay.com/sh/reports/help/create-listings-bulk/
 */

export const CSV_COLUMNS = [
  'Action',                    // ADD, REVISE, RELIST, END
  'CustomLabel',               // SKU (our internal ID)
  'Category',                  // eBay leaf category ID
  'Title',                     // Max 80 chars
  'ConditionID',               // 1000=New with tags, 1500=New without tags
  'Description',               // HTML allowed
  'PicURL',                    // Main image URL
  'Quantity',                  // Available stock
  'StartPrice',                // Listing price in USD
  'BuyItNowPrice',             // For auctions; same as StartPrice for fixed-price
  'Format',                    // FixedPrice or Auction
  'Duration',                  // GTC = Good 'Til Cancelled
  'PaymentProfileName',        // eBay Business Policy name
  'ReturnProfileName',         // eBay Business Policy name
  'ShippingProfileName',       // eBay Business Policy name
  'DispatchTimeMax',           // Business days to ship (3)
  'Location',                  // Ship-from location
  'Country',                   // Ship-from country code (CN)
  'Currency',                  // USD
  'Brand',                     // Item specific: Brand
  'C:Country/Region of Manufacture', // Item specific
  // Variation columns
  'Relationship',              // Variation
  'RelationshipDetails',       // Color=Red, Size=M, etc.
  // Image columns for variations
  '*PicURL',                   // Additional image URLs (pipe-separated)
] as const;

export type CSVColumn = typeof CSV_COLUMNS[number];

export const COL_IDX: Record<string, number> = {};
CSV_COLUMNS.forEach((col, i) => { COL_IDX[col] = i; });

export const COLUMN_COUNT = CSV_COLUMNS.length;

/**
 * eBay File Exchange header row for creating fixed-price listings.
 */
export function getHeaderRow(): string[] {
  return [...CSV_COLUMNS];
}

/**
 * Build a CSV row with all columns initialized to empty strings.
 */
export function emptyRow(): string[] {
  return Array(COLUMN_COUNT).fill('');
}
