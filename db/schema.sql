-- SVAYIRO initial Postgres schema
-- Run with: psql -d svayiro -f db/schema.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(32) UNIQUE,
  staff_login_id varchar(40) UNIQUE,
  name varchar(200),
  email varchar(200),
  password_hash text,
  date_of_birth date,
  is_phone_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  roles text[] DEFAULT ARRAY['customer'],
  wishlist uuid[] DEFAULT ARRAY[]::uuid[],
  saved_for_later jsonb DEFAULT '[]',
  saved_addresses jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_users_roles_allowed CHECK (roles <@ ARRAY['admin','inventory_manager','delivery_partner','customer_care','customer']::text[]),
  CONSTRAINT chk_users_phone_format CHECK (phone IS NULL OR phone ~ '^[0-9]{10,32}$')
);

-- Roles and user-role mapping
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(64) UNIQUE NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  permissions jsonb DEFAULT '{}',
  is_system boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_roles_code_allowed CHECK (code IN ('admin','inventory_manager','delivery_partner','customer_care','customer'))
);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role_id)
);

INSERT INTO roles(code, name, description, permissions) VALUES
  ('admin', 'Admin / Owner', 'Owner role with access to all admin modules and settings.', '{"all": true}'),
  ('inventory_manager', 'Inventory Manager', 'Can manage products, categories, stock, bags, and inventory logs.', '{"products": true, "categories": true, "inventory": true, "bags": true}'),
  ('delivery_partner', 'Delivery Partner', 'Can view assigned orders and update delivery status.', '{"orders": "delivery"}'),
  ('customer_care', 'Customer Care', 'Can manage complaints, tickets, customer support, and order assistance.', '{"complaints": true, "orders": "support"}'),
  ('customer', 'Customer', 'Customer storefront profile role.', '{"storefront": true}')
ON CONFLICT (code) DO NOTHING;

-- Shop profile (single row per shop instance)
CREATE TABLE shop_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  tagline varchar(400),
  description text,
  logo_url text,
  banner_url text,
  phone varchar(32),
  whatsapp varchar(32),
  personal_phone varchar(32),
  support_phone varchar(32),
  email varchar(200),
  address jsonb,
  addresses jsonb DEFAULT '[]',
  google_maps_link text,
  delivery_radius_km numeric DEFAULT 10,
  free_delivery_radius_km numeric DEFAULT 0,
  base_delivery_charge numeric DEFAULT 30,
  delivery_charge_per_km numeric DEFAULT 12,
  is_open boolean DEFAULT true,
  holiday_mode boolean DEFAULT false,
  operational_timings text DEFAULT '07:00 AM - 09:00 PM',
  announcement text,
  holiday_message text,
  delivery_slots jsonb DEFAULT '[]',
  working_hours jsonb DEFAULT '[]',
  announcements jsonb DEFAULT '[]',
  upi_id varchar(200),
  payment_qr_code_url text,
  social_links jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Categories
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  slug varchar(200) UNIQUE NOT NULL,
  description text,
  image_url text,
  is_enabled boolean DEFAULT true,
  position integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Products
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sku varchar(100) UNIQUE,
  name varchar(400) NOT NULL,
  slug varchar(400) UNIQUE NOT NULL,
  description text,
  base_price numeric NOT NULL DEFAULT 0,
  offer_price numeric DEFAULT 0,
  stock_count integer NOT NULL DEFAULT 0,
  weight_grams integer DEFAULT 0,
  is_enabled boolean DEFAULT true,
  low_stock_threshold integer DEFAULT 5,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_products_prices_nonnegative CHECK (base_price >= 0 AND offer_price >= 0),
  CONSTRAINT chk_products_stock_nonnegative CHECK (stock_count >= 0),
  CONSTRAINT chk_products_weight_nonnegative CHECK (weight_grams >= 0)
);

-- Products can appear in multiple category/subcategory sections.
CREATE TABLE product_categories (
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);

-- Product images (ordered)
CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- External package barcodes printed by other brands.
-- Keep these separate from SVAYIRO-generated SKU/product codes.
CREATE TABLE product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode_value varchar(100) NOT NULL UNIQUE,
  barcode_type varchar(30) DEFAULT 'EAN/UPC',
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_product_barcodes_product_id ON product_barcodes(product_id);

-- Banners
CREATE TABLE banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(400),
  image_url text,
  link text,
  link_type varchar(50) DEFAULT 'none',
  position integer DEFAULT 0,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Coupons / Offers
CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) UNIQUE NOT NULL,
  description text,
  discount_type varchar(20) NOT NULL,
  discount_value numeric NOT NULL,
  min_order_value numeric DEFAULT 0,
  max_uses integer DEFAULT NULL,
  expires_at timestamptz DEFAULT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Bags (smart bag configs)
CREATE TABLE bags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  size_label varchar(200) NOT NULL,
  capacity_grams integer NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  is_enabled boolean DEFAULT true,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Orders
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  order_ref varchar(100) UNIQUE,
  customer_name varchar(200),
  customer_phone varchar(32),
  status varchar(32) NOT NULL DEFAULT 'pending',
  payment_method varchar(32) NOT NULL DEFAULT 'cod',
  payment_status varchar(32) NOT NULL DEFAULT 'pending',
  payment_ref varchar(200),
  delivery_method varchar(32) NOT NULL DEFAULT 'delivery',
  delivery_address jsonb,
  selected_slot varchar(200),
  bag_option varchar(16) DEFAULT 'need',
  items jsonb NOT NULL,
  amount_total numeric NOT NULL DEFAULT 0,
  delivery_charge numeric DEFAULT 0,
  bag_charge numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  final_amount numeric DEFAULT 0,
  meta jsonb DEFAULT '{}',
  admin_archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_orders_status CHECK (status IN ('pending','accepted','packed','out_for_delivery','delivered','cancelled')),
  CONSTRAINT chk_orders_payment_method CHECK (payment_method IN ('cod','upi','cash','card')),
  CONSTRAINT chk_orders_payment_status CHECK (payment_status IN ('pending','submitted','paid','failed','refunded')),
  CONSTRAINT chk_orders_delivery_method CHECK (delivery_method IN ('delivery','pickup')),
  CONSTRAINT chk_orders_amounts_nonnegative CHECK (amount_total >= 0 AND delivery_charge >= 0 AND bag_charge >= 0 AND discount_amount >= 0 AND final_amount >= 0)
);

-- Order items (denormalized snapshot inside orders.items but keep table for reporting)
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name varchar(400),
  sku varchar(100),
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  purchase_unit_cost numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0
);

-- Loyalty ledger: server-owned accounting, never calculated only in the browser
CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  type varchar(50) NOT NULL,
  points integer NOT NULL,
  amount_value numeric NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Referral workflow: reward only after referred account places a qualifying order
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  referral_code varchar(40) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  qualifying_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  qualifying_amount numeric NOT NULL DEFAULT 0,
  reward_points integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  qualified_at timestamptz,
  UNIQUE(referred_user_id),
  CONSTRAINT chk_referrals_no_self CHECK (referrer_user_id <> referred_user_id),
  CONSTRAINT chk_referrals_status CHECK (status IN ('pending','qualified','cancelled'))
);

-- Inventory logs (audit trail)
CREATE TABLE inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  delta integer NOT NULL,
  reason varchar(200),
  source varchar(100),
  reference_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Reviews and replies
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_name varchar(200),
  customer_phone varchar(32),
  rating smallint NOT NULL,
  comment text,
  is_hidden boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE review_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid REFERENCES reviews(id) ON DELETE CASCADE,
  owner_reply text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_per_user_product
  ON reviews(product_id, user_id)
  WHERE user_id IS NOT NULL;

-- Notifications
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(400),
  body text,
  type varchar(50),
  payload jsonb DEFAULT '{}',
  audience varchar(30) DEFAULT 'customer',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(400) NOT NULL,
  body text NOT NULL,
  type varchar(50) NOT NULL DEFAULT 'system',
  source varchar(80),
  severity varchar(32) NOT NULL DEFAULT 'info',
  status varchar(32) NOT NULL DEFAULT 'unread',
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_status ON admin_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_type ON admin_alerts(type, created_at DESC);

-- Advance requests
CREATE TABLE advance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_name varchar(200),
  customer_phone varchar(32),
  product_name varchar(400) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  target_date date,
  status varchar(32) DEFAULT 'pending',
  note text,
  order_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Normalized wishlist rows. users.wishlist remains for backwards compatibility.
CREATE TABLE wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Complaints / support tickets
CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_name varchar(200),
  customer_phone varchar(32),
  subject varchar(400) NOT NULL,
  category varchar(100) DEFAULT 'other',
  description text NOT NULL,
  admin_answer text,
  answered_at timestamptz,
  priority varchar(32) DEFAULT 'medium',
  status varchar(32) DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_complaints_status CHECK (status IN ('open','in_progress','resolved','closed')),
  CONSTRAINT chk_complaints_priority CHECK (priority IN ('low','medium','high'))
);

-- Payments (store gateway events)
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  provider varchar(100),
  provider_ref varchar(200),
  amount numeric,
  status varchar(50),
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_payments_status CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  CONSTRAINT chk_payments_amount_nonnegative CHECK (amount >= 0)
);

-- Payment records with audit fields. payments remains for existing UPI flow compatibility.
CREATE TABLE payment_records (
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
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_payment_records_status CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  CONSTRAINT chk_payment_records_method CHECK (method IN ('cod','upi','cash','card','manual')),
  CONSTRAINT chk_payment_records_amount_nonnegative CHECK (amount >= 0)
);

-- Invoice records for online orders and POS bills
CREATE TABLE invoices (
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
  public_token varchar(120) UNIQUE,
  whatsapp_status varchar(50) DEFAULT 'not_sent',
  whatsapp_sent_at timestamptz,
  metadata jsonb DEFAULT '{}',
  archived_at timestamptz,
  issued_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Customer search history for signed-in users. Browser localStorage can still be used offline.
CREATE TABLE customer_search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  term varchar(200) NOT NULL,
  metadata jsonb DEFAULT '{}',
  searched_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_subcategory ON products(subcategory_id);
CREATE INDEX idx_product_categories_category ON product_categories(category_id);
CREATE INDEX idx_product_categories_product ON product_categories(product_id);
CREATE INDEX idx_products_stock ON products(stock_count);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_phone ON orders(customer_phone);
CREATE INDEX idx_orders_admin_archived ON orders(admin_archived_at);
CREATE INDEX idx_inventory_product ON inventory_logs(product_id);
CREATE INDEX idx_inventory_created_at ON inventory_logs(created_at DESC);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_wishlists_user ON wishlists(user_id);
CREATE INDEX idx_payment_records_order ON payment_records(order_id);
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_search_history_user ON customer_search_history(user_id);
CREATE INDEX idx_loyalty_transactions_user ON loyalty_transactions(user_id);
CREATE INDEX idx_loyalty_transactions_order ON loyalty_transactions(order_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_complaints_phone ON complaints(customer_phone);
CREATE INDEX idx_complaints_status ON complaints(status);

COMMIT;
