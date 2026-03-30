/**
 * eBay Seller Hub Reports CSV column definitions — matches the official
 * "fx_category_template_EBAY_US" template downloaded from Seller Hub.
 *
 * 96 columns, exact order.  Columns prefixed with * are required by eBay.
 *
 * https://pages.ebay.com/sh/reports/help/create-listings-bulk/
 */

export const CSV_COLUMNS = [
  /* 0  */ '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
  /* 1  */ 'CustomLabel',
  /* 2  */ '*Category',
  /* 3  */ 'StoreCategory',
  /* 4  */ '*Title',
  /* 5  */ 'Subtitle',
  /* 6  */ 'Relationship',
  /* 7  */ 'RelationshipDetails',
  /* 8  */ 'ScheduleTime',
  /* 9  */ '*ConditionID',
  /* 10 */ '*C:Brand',
  /* 11 */ '*C:Style',
  /* 12 */ '*C:Size',
  /* 13 */ '*C:Color',
  /* 14 */ '*C:Department',
  /* 15 */ 'C:Theme',
  /* 16 */ 'C:Features',
  /* 17 */ 'C:Pattern',
  /* 18 */ 'C:Material',
  /* 19 */ 'C:Country of Origin',
  /* 20 */ 'C:Fabric Type',
  /* 21 */ 'C:Character',
  /* 22 */ 'C:Occasion',
  /* 23 */ 'C:Vintage',
  /* 24 */ 'C:Season',
  /* 25 */ 'C:Handmade',
  /* 26 */ 'C:Personalize',
  /* 27 */ 'C:Signed',
  /* 28 */ 'C:Model',
  /* 29 */ 'C:California Prop 65 Warning',
  /* 30 */ 'C:MPN',
  /* 31 */ 'C:Personalization Instructions',
  /* 32 */ 'C:Unit Quantity',
  /* 33 */ 'C:Unit Type',
  /* 34 */ '*C:Type',
  /* 35 */ 'C:Item Width',
  /* 36 */ 'C:Accents',
  /* 37 */ 'C:Item Length',
  /* 38 */ 'C:Attachment Type',
  /* 39 */ 'C:Number of Pieces',
  /* 40 */ 'C:Year Manufactured',
  /* 41 */ 'PicURL',
  /* 42 */ 'GalleryType',
  /* 43 */ 'VideoID',
  /* 44 */ '*Description',
  /* 45 */ '*Format',
  /* 46 */ '*Duration',
  /* 47 */ '*StartPrice',
  /* 48 */ 'BuyItNowPrice',
  /* 49 */ 'BestOfferEnabled',
  /* 50 */ 'BestOfferAutoAcceptPrice',
  /* 51 */ 'MinimumBestOfferPrice',
  /* 52 */ '*Quantity',
  /* 53 */ 'ImmediatePayRequired',
  /* 54 */ '*Location',
  /* 55 */ 'ShippingType',
  /* 56 */ 'ShippingService-1:Option',
  /* 57 */ 'ShippingService-1:Cost',
  /* 58 */ 'ShippingService-2:Option',
  /* 59 */ 'ShippingService-2:Cost',
  /* 60 */ '*DispatchTimeMax',
  /* 61 */ 'PromotionalShippingDiscount',
  /* 62 */ 'ShippingDiscountProfileID',
  /* 63 */ '*ReturnsAcceptedOption',
  /* 64 */ 'ReturnsWithinOption',
  /* 65 */ 'RefundOption',
  /* 66 */ 'ShippingCostPaidByOption',
  /* 67 */ 'AdditionalDetails',
  /* 68 */ 'ShippingProfileName',
  /* 69 */ 'ReturnProfileName',
  /* 70 */ 'PaymentProfileName',
  // 71-95: Product Safety / Manufacturer / Responsible Person (leave empty)
  /* 71 */ 'Product Safety Pictograms',
  /* 72 */ 'Product Safety Statements',
  /* 73 */ 'Product Safety Component',
  /* 74 */ 'Regulatory Document Ids',
  /* 75 */ 'Manufacturer Name',
  /* 76 */ 'Manufacturer AddressLine1',
  /* 77 */ 'Manufacturer AddressLine2',
  /* 78 */ 'Manufacturer City',
  /* 79 */ 'Manufacturer Country',
  /* 80 */ 'Manufacturer PostalCode',
  /* 81 */ 'Manufacturer StateOrProvince',
  /* 82 */ 'Manufacturer Phone',
  /* 83 */ 'Manufacturer Email',
  /* 84 */ 'Manufacturer ContactURL',
  /* 85 */ 'Responsible Person 1',
  /* 86 */ 'Responsible Person 1 Type',
  /* 87 */ 'Responsible Person 1 AddressLine1',
  /* 88 */ 'Responsible Person 1 AddressLine2',
  /* 89 */ 'Responsible Person 1 City',
  /* 90 */ 'Responsible Person 1 Country',
  /* 91 */ 'Responsible Person 1 PostalCode',
  /* 92 */ 'Responsible Person 1 StateOrProvince',
  /* 93 */ 'Responsible Person 1 Phone',
  /* 94 */ 'Responsible Person 1 Email',
  /* 95 */ 'Responsible Person 1 ContactURL',
  // Category-specific item specifics (eyewear, shoes, jewelry, watches)
  /* 96  */ 'C:Frame Color',
  /* 97  */ 'C:Lens Technology',
  /* 98  */ 'C:Frame Material',
  /* 99  */ 'C:Protection',
  /* 100 */ 'C:US Shoe Size',
  /* 101 */ 'C:Base Metal',
  /* 102 */ 'C:Main Stone',
  /* 103 */ 'C:Movement',
  /* 104 */ 'C:Display',
  /* 105 */ 'C:Lens Strength',
  /* 106 */ 'C:Ring Size',
  /* 107 */ 'C:Upper Material',
] as const;

export type CSVColumn = typeof CSV_COLUMNS[number];

/** Fast index lookup: column name → position (0-95) */
export const COL_IDX: Record<string, number> = {};
CSV_COLUMNS.forEach((col, i) => { COL_IDX[col] = i; });

export const COLUMN_COUNT = CSV_COLUMNS.length; // 108

// ─── Metadata lines (must appear before data) ─────────────────────────────────

/** Line 0: version + template identifier — eBay checks this on upload. */
export const INFO_LINE = 'Info,Version=1.0.0,Template=fx_category_template_EBAY_US';

/** Line 5: help link line that appears after the 3 empty rows. */
export const HELP_LINE =
  'Info,>>> Get more details on how to complete listings and discover how to customise your listings with advanced features: https://pages.ebay.com/sh/reports/help/create-listings-bulk/#_nq6onyvjkyg';

// ─── Row helpers ───────────────────────────────────────────────────────────────

/** Return the 96-column header row. */
export function getHeaderRow(): string[] {
  return [...CSV_COLUMNS];
}

/** Return a row with all 96 columns set to empty string. */
export function emptyRow(): string[] {
  return Array(COLUMN_COUNT).fill('');
}
