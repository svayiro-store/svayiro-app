import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/svayiro';
const schemaPath = path.resolve('db/schema.sql');

function getConnectionInfo() {
  const url = new URL(DATABASE_URL);
  const databaseName = url.pathname.replace(/^\//, '') || 'svayiro';
  return { url, databaseName };
}

async function ensureDatabaseExists() {
  const { url, databaseName } = getConnectionInfo();
  const maintenanceUrl = new URL(url.toString());
  maintenanceUrl.pathname = '/postgres';
  const pool = new pg.Pool({ connectionString: maintenanceUrl.toString() });
  const client = await pool.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (exists.rowCount > 0) return;

    const escapedName = databaseName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
    console.log(`Database "${databaseName}" created.`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function run() {
  await ensureDatabaseExists();
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  const applyCompatibilityMigrations = async () => {
    await client.query('ALTER TABLE users ALTER COLUMN phone TYPE varchar(32)');
    await client.query('ALTER TABLE users ALTER COLUMN phone DROP NOT NULL');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true');
    await client.query('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS personal_phone varchar(32)');
    await client.query('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS support_phone varchar(32)');
    await client.query("ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS addresses jsonb DEFAULT '[]'");
    await client.query("ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS operational_timings text DEFAULT '07:00 AM - 09:00 PM'");
    await client.query('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS announcement text');
    await client.query('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS holiday_message text');
    await client.query("ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS delivery_slots jsonb DEFAULT '[]'");
    await client.query('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS payment_qr_code_url text');
    await client.query("ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]'");
    await client.query("ALTER TABLE banners ADD COLUMN IF NOT EXISTS link_type varchar(50) DEFAULT 'none'");
    await client.query('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS customer_name varchar(200)');
    await client.query('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS customer_phone varchar(32)');
    await client.query('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS order_id uuid');
    await client.query('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()');
    await client.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS purchase_unit_cost numeric NOT NULL DEFAULT 0');
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES categories(id) ON DELETE SET NULL');
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        product_id uuid REFERENCES products(id) ON DELETE CASCADE,
        category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
        is_primary boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        PRIMARY KEY (product_id, category_id)
      )
    `);
    await client.query(`
      INSERT INTO product_categories(product_id, category_id, is_primary)
      SELECT id, category_id, true
      FROM products
      WHERE category_id IS NOT NULL
      ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary = product_categories.is_primary OR EXCLUDED.is_primary
    `);
    await client.query(`
      INSERT INTO product_categories(product_id, category_id, is_primary)
      SELECT id, subcategory_id, false
      FROM products
      WHERE subcategory_id IS NOT NULL
      ON CONFLICT (product_id, category_id) DO NOTHING
    `);
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth date');
    await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_created_at ON inventory_logs(created_at DESC)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        customer_name varchar(200),
        customer_phone varchar(32),
        subject varchar(400) NOT NULL,
        category varchar(100) DEFAULT 'other',
        description text NOT NULL,
        priority varchar(32) DEFAULT 'medium',
        status varchar(32) DEFAULT 'open',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    await client.query('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()');
    await client.query('UPDATE categories SET is_enabled = true WHERE is_enabled IS DISTINCT FROM true');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(64) UNIQUE NOT NULL,
        name varchar(120) NOT NULL,
        description text,
        permissions jsonb DEFAULT '{}',
        is_system boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
        assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
        assigned_at timestamptz DEFAULT now(),
        UNIQUE(user_id, role_id)
      )
    `);
    await client.query(`
      INSERT INTO roles(code, name, description, permissions) VALUES
        ('admin', 'Admin / Owner', 'Owner role with access to all admin modules and settings.', '{"all": true}'),
        ('inventory_manager', 'Inventory Manager', 'Can manage products, categories, stock, bags, and inventory logs.', '{"products": true, "categories": true, "inventory": true, "bags": true}'),
        ('delivery_partner', 'Delivery Partner', 'Can view assigned orders and update delivery status.', '{"orders": "delivery"}'),
        ('customer_care', 'Customer Care', 'Can manage complaints, tickets, customer support, and order assistance.', '{"complaints": true, "orders": "support"}'),
        ('customer', 'Customer', 'Customer storefront profile role.', '{"storefront": true}')
      ON CONFLICT (code) DO NOTHING
    `);
    await client.query(`
      INSERT INTO user_roles(user_id, role_id)
      SELECT u.id, r.id
      FROM users u
      CROSS JOIN LATERAL unnest(COALESCE(u.roles, ARRAY['customer']::text[])) AS role_code
      JOIN roles r ON r.code = role_code
      ON CONFLICT (user_id, role_id) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        product_id uuid REFERENCES products(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now(),
        UNIQUE(user_id, product_id)
      )
    `);
    await client.query(`
      INSERT INTO wishlists(user_id, product_id)
      SELECT u.id, wishlist_product_id
      FROM users u
      CROSS JOIN LATERAL unnest(COALESCE(u.wishlist, ARRAY[]::uuid[])) AS wishlist_product_id
      ON CONFLICT (user_id, product_id) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_barcodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        barcode_value varchar(100) NOT NULL UNIQUE,
        barcode_type varchar(30) DEFAULT 'EAN/UPC',
        is_primary boolean DEFAULT false,
        created_at timestamptz DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id ON product_barcodes(product_id)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        provider varchar(100) DEFAULT 'manual',
        provider_ref varchar(200),
        method varchar(32) NOT NULL DEFAULT 'cod',
        amount numeric NOT NULL DEFAULT 0,
        currency varchar(12) DEFAULT 'INR',
        status varchar(50) NOT NULL DEFAULT 'pending',
        paid_at timestamptz,
        payload jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
        invoice_no varchar(100) UNIQUE NOT NULL,
        invoice_type varchar(50) NOT NULL DEFAULT 'online_order',
        customer_name varchar(200),
        customer_phone varchar(32),
        billing_address jsonb,
        line_items jsonb NOT NULL DEFAULT '[]',
        subtotal numeric NOT NULL DEFAULT 0,
        delivery_charge numeric NOT NULL DEFAULT 0,
        bag_charge numeric NOT NULL DEFAULT 0,
        discount_amount numeric NOT NULL DEFAULT 0,
        total_amount numeric NOT NULL DEFAULT 0,
        payment_status varchar(50) DEFAULT 'pending',
        invoice_text text,
        public_token varchar(120),
        whatsapp_status varchar(50) DEFAULT 'not_sent',
        whatsapp_sent_at timestamptz,
        metadata jsonb DEFAULT '{}',
        issued_at timestamptz DEFAULT now(),
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_search_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        term varchar(200) NOT NULL,
        metadata jsonb DEFAULT '{}',
        searched_at timestamptz DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id)');
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_token varchar(120)');
    await client.query("UPDATE invoices SET public_token = encode(gen_random_bytes(24), 'hex') WHERE public_token IS NULL");
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token ON invoices(public_token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_search_history_user ON customer_search_history(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_complaints_phone ON complaints(customer_phone)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status)');
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_phone_format') THEN
          ALTER TABLE users DROP CONSTRAINT chk_users_phone_format;
        END IF;
        ALTER TABLE users ADD CONSTRAINT chk_users_phone_format CHECK (phone IS NULL OR phone ~ '^[0-9]{10,32}$');
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_roles_allowed') THEN
          ALTER TABLE users ADD CONSTRAINT chk_users_roles_allowed CHECK (roles <@ ARRAY['admin','inventory_manager','delivery_partner','customer_care','customer']::text[]);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_roles_code_allowed') THEN
          ALTER TABLE roles ADD CONSTRAINT chk_roles_code_allowed CHECK (code IN ('admin','inventory_manager','delivery_partner','customer_care','customer'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_prices_nonnegative') THEN
          ALTER TABLE products ADD CONSTRAINT chk_products_prices_nonnegative CHECK (base_price >= 0 AND offer_price >= 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_nonnegative') THEN
          ALTER TABLE products ADD CONSTRAINT chk_products_stock_nonnegative CHECK (stock_count >= 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_status') THEN
          ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK (status IN ('pending','accepted','packed','out_for_delivery','delivered','cancelled'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_method') THEN
          ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_method CHECK (payment_method IN ('cod','upi','cash','card'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_status') THEN
          ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_status CHECK (payment_status IN ('pending','paid','failed','refunded'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_records_status') THEN
          ALTER TABLE payment_records ADD CONSTRAINT chk_payment_records_status CHECK (status IN ('pending','paid','failed','cancelled','refunded'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_records_method') THEN
          ALTER TABLE payment_records ADD CONSTRAINT chk_payment_records_method CHECK (method IN ('cod','upi','cash','card','manual'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_complaints_status') THEN
          ALTER TABLE complaints ADD CONSTRAINT chk_complaints_status CHECK (status IN ('open','in_progress','resolved','closed'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_complaints_priority') THEN
          ALTER TABLE complaints ADD CONSTRAINT chk_complaints_priority CHECK (priority IN ('low','medium','high'));
        END IF;
      END $$;
    `);
  };

  try {
    const exists = await client.query("SELECT to_regclass('public.users') AS users_table");
    if (exists.rows[0]?.users_table && process.env.FORCE_DB_INIT !== 'true') {
      console.log('Database schema already exists. Skipping db/schema.sql.');
      await applyCompatibilityMigrations();
      console.log('Database compatibility migrations applied.');
      return;
    }

    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    await client.query(schemaSql);
    await applyCompatibilityMigrations();
    console.log('Database schema initialized from db/schema.sql.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Database initialization failed:', {
    message: err.message,
    code: err.code,
    detail: err.detail,
    hint: err.hint,
    position: err.position,
    where: err.where
  });
  process.exit(1);
});
