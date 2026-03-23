import mysql, { Pool } from 'mysql2/promise';
import { createChildLogger } from '../utils/logger';
import { config } from '../config';

const logger = createChildLogger('database');

let pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const conn = await pool.getConnection();
    logger.info('Database connected', { host: config.mysql.host, database: config.mysql.database });
    conn.release();
  }
  return pool;
}

export function closeDatabase(): void {
  if (pool) {
    pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}

export async function initSchema(): Promise<void> {
  const p = await getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_1688 VARCHAR(50) NOT NULL,
      source_product_id INT,
      status VARCHAR(50) DEFAULT 'imported',
      url VARCHAR(1000),
      title_zh VARCHAR(500),
      category VARCHAR(200),
      thumbnail_url VARCHAR(1000),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_id_1688 (id_1688)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS products_raw (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL UNIQUE,
      title_zh TEXT,
      description_zh TEXT,
      specifications_zh JSON,
      price_cny DECIMAL(10,2),
      seller_name VARCHAR(200),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS products_en (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL UNIQUE,
      title_en TEXT,
      description_en TEXT,
      specifications_en JSON,
      price_usd DECIMAL(10,2),
      category VARCHAR(200),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS products_images_ok (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      raw_image_id INT,
      image_url VARCHAR(1000) NOT NULL,
      image_type ENUM('gallery','description','variant') DEFAULT 'gallery',
      sort_order INT DEFAULT 0,
      passed TINYINT(1) DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      INDEX idx_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      variant_name_zh VARCHAR(100),
      variant_name_en VARCHAR(100),
      sort_order INT DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      INDEX idx_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS variant_values (
      id INT AUTO_INCREMENT PRIMARY KEY,
      variant_id INT NOT NULL,
      value_name_zh VARCHAR(200),
      value_name_en VARCHAR(200),
      image_url VARCHAR(1000),
      sort_order INT DEFAULT 0,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
      INDEX idx_variant_id (variant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS variant_skus (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      sku_code VARCHAR(100),
      variant_values_json JSON,
      price_cny DECIMAL(10,2),
      stock INT DEFAULT 0,
      available TINYINT(1) DEFAULT 1,
      image_url VARCHAR(1000),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      INDEX idx_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS platform_listings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      platform VARCHAR(50) NOT NULL DEFAULT 'ebay',
      platform_product_id VARCHAR(100),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_product_platform (product_id, platform),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  logger.info('Schema initialized');
}

export async function upsertPlatformListing(
  id1688: string,
  platform: string,
  platformProductId: string
): Promise<void> {
  const p = await getPool();

  const [rows] = await p.query<any[]>(
    'SELECT id FROM products WHERE id_1688 = ? LIMIT 1',
    [id1688]
  );
  if (!rows || rows.length === 0) {
    logger.warn('Product not found for platform listing', { id1688, platform });
    return;
  }
  const productId = rows[0].id;

  await p.query(`
    INSERT INTO platform_listings (product_id, platform, platform_product_id, status)
    VALUES (?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE
      platform_product_id = VALUES(platform_product_id),
      status = 'active',
      updated_at = NOW()
  `, [productId, platform, platformProductId]);

  // Also write to 1688_source.listing_mappings (cross-DB)
  try {
    await p.query(`
      INSERT INTO ${config.sourceDb.database}.listing_mappings
        (product_id, platform, store_id, platform_product_id)
      SELECT sp.id, ?, '', ?
      FROM ${config.sourceDb.database}.products sp
      WHERE sp.id_1688 = ?
      ON DUPLICATE KEY UPDATE
        platform_product_id = VALUES(platform_product_id),
        updated_at = NOW()
    `, [platform, platformProductId, id1688]);
  } catch (err: any) {
    logger.warn('Could not write to 1688_source.listing_mappings', { error: err.message });
  }

  logger.info('Platform listing upserted', { id1688, platform, platformProductId });
}
