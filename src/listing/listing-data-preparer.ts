/**
 * Transforms a raw ExportProduct into structured ListingData
 * ready for the eBay single-listing form automation.
 */

import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { isBannedBrand, truncateToBytes } from '../utils/helpers';
import {
  sanitizeTitle,
  buildDescription,
  calculatePriceUsd,
  containsChinese,
} from '../csv/csv-generator';
import { ExportProduct, EBAY_CATEGORY_MAP, EbayCategoryInfo } from '../models/product';

const logger = createChildLogger('listing-data-preparer');

export interface ListingData {
  productId: number;
  id1688: string;
  title: string;
  description: string;
  category: EbayCategoryInfo;
  categoryKey: string;
  sku: string;
  price: number;
  quantity: number;
  conditionId: number;
  itemSpecifics: Record<string, string>;
  galleryImageUrls: string[];
  businessPolicies: {
    shipping: string;
    return: string;
    payment: string;
  };
  hasVariants: boolean;
}

export function prepareListingData(product: ExportProduct): ListingData | null {
  const { en } = product;

  // Brand safety check
  if (isBannedBrand(en.titleEn)) {
    logger.warn('Banned brand detected, skipping', { id1688: product.id1688 });
    return null;
  }

  // Chinese title check
  if (containsChinese(en.titleEn)) {
    logger.warn('Chinese title, skipping', { id1688: product.id1688 });
    return null;
  }

  // Category check
  const catInfo = EBAY_CATEGORY_MAP[product.category];
  if (!catInfo) {
    logger.warn('No eBay category mapping', { category: product.category });
    return null;
  }

  // Gallery images
  const galleryImages = product.images
    .filter(img => img.imageType === 'gallery')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (galleryImages.length === 0) {
    logger.warn('No gallery images', { id1688: product.id1688 });
    return null;
  }

  // Price
  const price = calculatePriceUsd(product.priceCny, en.priceUsd);

  // Title (sanitized + truncated to 80 bytes)
  const title = truncateToBytes(sanitizeTitle(en.titleEn), 80);

  // Description
  const description = buildDescription(en.titleEn, en.specificationsEn);

  // Item specifics from category defaults
  const itemSpecifics: Record<string, string> = {
    Brand: config.listing.brandName,
    'Country/Region of Manufacture': 'China',
    ...catInfo.itemSpecifics,
  };

  // Try to extract Material from product specs if not set by category
  if (!itemSpecifics.Material && en.specificationsEn) {
    for (const spec of en.specificationsEn) {
      const name = spec.name.toLowerCase();
      if (name.includes('material') || name.includes('fabric')) {
        itemSpecifics.Material = spec.value.substring(0, 65);
        break;
      }
    }
  }

  // Variant check
  const hasVariants =
    (product.skus?.length ?? 0) > 1 &&
    (product.variantStructure?.length ?? 0) > 0;

  return {
    productId: product.id,
    id1688: product.id1688,
    title,
    description,
    category: catInfo,
    categoryKey: product.category,
    sku: `1688-${product.id1688}`,
    price,
    quantity: config.listing.defaultStock,
    conditionId: catInfo.conditionId,
    itemSpecifics,
    galleryImageUrls: galleryImages.slice(0, 12).map(img => img.imageUrl),
    businessPolicies: {
      shipping: config.businessPolicies.shippingProfileName,
      return: config.businessPolicies.returnProfileName,
      payment: config.businessPolicies.paymentProfileName,
    },
    hasVariants,
  };
}
