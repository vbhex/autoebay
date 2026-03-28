/**
 * eBay Seller Hub Reports CSV column definitions.
 *
 * When uploading via Seller Hub Reports → Uploads → "Create new listings",
 * the CSV uses the "Action" column to determine what to do with each row.
 *
 * For File Exchange / Seller Hub Reports upload format:
 * https://pages.ebay.com/sh/reports/help/create-listings-bulk/
 *
 * NOTE: We use direct shipping/return fields (NOT business policy names)
 * because business policies are not enabled on this account.
 */

export const CSV_COLUMNS = [
  'Action',                    // Add, Revise, Relist, End
  'CustomLabel',               // SKU (our internal ID)
  'Category',                  // eBay leaf category ID
  'Title',                     // Max 80 chars
  'ConditionID',               // 1000=New with tags, 1500=New without tags
  'Description',               // HTML allowed (single-line, no literal newlines)
  'PicURL',                    // Main image URL
  'Quantity',                  // Available stock
  'StartPrice',                // Listing price in USD
  'Format',                    // FixedPrice or Auction
  'Duration',                  // GTC = Good 'Til Cancelled
  'DispatchTimeMax',           // Business days to ship (3)
  'Location',                  // Ship-from location
  'Country',                   // Ship-from country code (CN)
  'Currency',                  // USD
  // Shipping
  'ShippingType',              // Flat
  'ShippingService-1:Option',  // Economy shipping service name
  'ShippingService-1:Cost',    // Shipping cost
  'ShippingService-1:FreeShipping', // y = free shipping
  // International shipping
  'IntlShippingService-1:Option',   // International economy
  'IntlShippingService-1:Cost',     // International shipping cost
  'IntlShippingService-1:Locations', // Ship-to locations (Worldwide)
  // Returns
  'ReturnsAcceptedOption',     // ReturnsAccepted or ReturnsNotAccepted
  'ReturnsWithinOption',       // Days30, Days60
  'RefundOption',              // MoneyBack, MoneyBackOrExchange
  'ShippingCostPaidByOption',  // Buyer or Seller
  // Item specifics
  'Brand',                     // Item specific: Brand
  'C:MPN',                     // Manufacturer Part Number ('Does Not Apply' for unbranded)
  'C:Country/Region of Manufacture', // Item specific
  // Variation columns
  'Relationship',              // Variation
  'RelationshipDetails',       // Color=Red;Size=M
  // Variation specifics columns (must match names in RelationshipDetails)
  'C:Color',                   // Variation dimension: Color
  'C:Size',                    // Variation dimension: Size
  'C:Style',                   // Variation dimension: Style
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
