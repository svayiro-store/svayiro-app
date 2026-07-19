import 'dotenv/config';
import pg from 'pg';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/svayiro';
const phone = normalizePhone(process.env.SVAYIRO_ADMIN_PHONE || '9876543210');
const name = process.env.SVAYIRO_ADMIN_NAME || 'SVAYIRO Admin';
const email = process.env.SVAYIRO_ADMIN_EMAIL || 'admin@svayiro.local';
const adminPassword = process.env.SVAYIRO_ADMIN_PASSWORD || 'Admin12345';
const defaultCategories = process.env.SVAYIRO_DEFAULT_CATEGORIES ? JSON.parse(process.env.SVAYIRO_DEFAULT_CATEGORIES) : [
  { name: 'Essentials', slug: 'essentials', description: 'Daily essentials and groceries', position: 0 },
  { name: 'Home Care', slug: 'home-care', description: 'Cleaning and home care products', position: 1 },
  { name: 'Personal Care', slug: 'personal-care', description: 'Health and personal care items', position: 2 }
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function normalizeRoles(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

async function ensureAdminUser(client, refreshToken) {
  const res = await client.query('SELECT * FROM users WHERE phone = $1', [phone]);
  const metadata = { seeded: true, refreshToken };
  const passwordHash = hashPassword(adminPassword);
  if (res.rowCount === 0) {
    const insert = await client.query(
      'INSERT INTO users(phone, name, email, password_hash, is_phone_verified, roles, metadata, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING *',
      [phone, name, email, passwordHash, true, ['admin'], metadata]
    );
    return insert.rows[0];
  }
  const user = res.rows[0];
  const roles = normalizeRoles(user.roles);
  if (!roles.includes('admin')) roles.push('admin');
  const updatedMetadata = { ...(user.metadata || {}), ...metadata };
  const upd = await client.query(
    'UPDATE users SET roles = $1, metadata = $2, password_hash = CASE WHEN $3 THEN $4 ELSE COALESCE(password_hash, $4) END, is_phone_verified = $5, updated_at = now() WHERE id = $6 RETURNING *',
    [roles, updatedMetadata, Boolean(process.env.SVAYIRO_ADMIN_PASSWORD), passwordHash, true, user.id]
  );
  return upd.rows[0];
}

async function syncAdminRole(client, userId) {
  await client.query(`
    INSERT INTO roles(code, name, description, permissions) VALUES
      ('admin', 'Admin / Owner', 'Owner role with access to all admin modules and settings.', '{"all": true}'),
      ('customer', 'Customer', 'Customer storefront profile role.', '{"storefront": true}')
    ON CONFLICT (code) DO NOTHING
  `);
  await client.query(`
    INSERT INTO user_roles(user_id, role_id)
    SELECT $1, id FROM roles WHERE code = 'admin'
    ON CONFLICT (user_id, role_id) DO NOTHING
  `, [userId]);
}

async function ensureDefaultCategories(client) {
  for (const category of defaultCategories) {
    const existing = await client.query('SELECT id FROM categories WHERE slug = $1', [category.slug]);
    if (existing.rowCount === 0) {
      await client.query(
        'INSERT INTO categories(name, slug, description, image_url, is_enabled, position, metadata, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())',
        [category.name, category.slug, category.description || null, category.image_url || null, true, category.position || 0, category.metadata || {}]
      );
    }
  }
}

async function run() {
  const client = await pool.connect();
  try {
    const refreshToken = crypto.randomBytes(12).toString('hex');
    await client.query('BEGIN');
    const adminUser = await ensureAdminUser(client, refreshToken);
    await syncAdminRole(client, adminUser.id);
    await ensureDefaultCategories(client);
    await client.query('COMMIT');
    console.log('Seed complete. Admin user:');
    console.log({ id: adminUser.id, phone: adminUser.phone, email: adminUser.email, roles: adminUser.roles });
    if (!process.env.SVAYIRO_ADMIN_PASSWORD) {
      console.log('Default development admin password:', adminPassword);
      console.log('Set SVAYIRO_ADMIN_PASSWORD in .env before production.');
    }
    console.log('Refresh token:', refreshToken);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
