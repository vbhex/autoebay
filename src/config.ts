import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface Config {
  ebay: {
    username: string;
    password: string;
    sellerLoginUrl: string;
    sellerHubUrl: string;
    reportsUrl: string;
  };
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  sourceDb: {
    database: string;
  };
  pricing: {
    markup: number;
    minRetailPriceUsd: number;
  };
  listing: {
    brandName: string;
    shipsFrom: string;
    defaultStock: number;
    condition: string;
    returnDays: number;
    dispatchDays: number;
  };
  shipping: {
    service: string;
    cost: number;
  };
  paths: {
    output: string;
    logs: string;
    data: string;
  };
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || defaultValue || '';
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${name}`);
  }
  return parsed;
}

export function loadConfig(): Config {
  const projectRoot = path.resolve(__dirname, '..');

  return {
    ebay: {
      username: getEnvVar('EBAY_USERNAME', ''),
      password: getEnvVar('EBAY_PASSWORD', ''),
      sellerLoginUrl: getEnvVar('EBAY_SELLER_LOGIN_URL', 'https://signin.ebay.com/'),
      sellerHubUrl: getEnvVar('EBAY_SELLER_HUB_URL', 'https://www.ebay.com/sh/ovw'),
      reportsUrl: getEnvVar('EBAY_REPORTS_URL', 'https://www.ebay.com/sh/reports'),
    },
    mysql: {
      host: getEnvVar('MYSQL_HOST', 'localhost'),
      port: getEnvNumber('MYSQL_PORT', 3306),
      user: getEnvVar('MYSQL_USER', 'root'),
      password: getEnvVar('MYSQL_PASSWORD', ''),
      database: getEnvVar('MYSQL_DATABASE', 'ebay_autostore'),
    },
    sourceDb: {
      database: getEnvVar('SOURCE_MYSQL_DATABASE', '1688_source'),
    },
    pricing: {
      markup: getEnvNumber('PRICE_MARKUP', 3.0),
      minRetailPriceUsd: getEnvNumber('MIN_RETAIL_PRICE_USD', 9.99),
    },
    listing: {
      brandName: getEnvVar('LISTING_BRAND_NAME', 'Unbranded'),
      shipsFrom: getEnvVar('LISTING_SHIPS_FROM', 'China'),
      defaultStock: getEnvNumber('LISTING_DEFAULT_STOCK', 999),
      condition: getEnvVar('LISTING_CONDITION', 'New'),
      returnDays: getEnvNumber('LISTING_RETURN_DAYS', 30),
      dispatchDays: getEnvNumber('LISTING_DISPATCH_DAYS', 3),
    },
    shipping: {
      service: getEnvVar('SHIPPING_SERVICE', 'Economy International Shipping'),
      cost: getEnvNumber('SHIPPING_COST', 0),
    },
    paths: {
      output: path.join(projectRoot, 'output'),
      logs: path.join(projectRoot, 'logs'),
      data: path.join(projectRoot, 'data'),
    },
  };
}

export const config = loadConfig();
