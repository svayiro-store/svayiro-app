import 'dotenv/config';
import pg from 'pg';
import { createHash } from 'crypto';

const { Client } = pg;

const FOLDERS = {
  products: 'svayiro/products',
  categories: 'svayiro/categories',
  banners: 'svayiro/banners',
  logo: 'svayiro/logo'
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function shouldMigrateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('res.cloudinary.com/')) return false;
  if (/^https?:\/\/share\.google\//i.test(url)) return false;
  return url.startsWith('data:image/') || /^https?:\/\//i.test(url);
}

async function uploadToCloudinary(file, folderKey) {
  const cloudName = requiredEnv('CLOUDINARY_CLOUD_NAME');
  const apiKey = requiredEnv('CLOUDINARY_API_KEY');
  const apiSecret = requiredEnv('CLOUDINARY_API_SECRET');
  const folder = FOLDERS[folderKey] || FOLDERS.products;
  const timestamp = Math.floor(Date.now() / 1000);
  const uniqueFilename = 'true';
  const signaturePayload = `folder=${folder}&timestamp=${timestamp}&unique_filename=${uniqueFilename}${apiSecret}`;
  const signature = createHash('sha1').update(signaturePayload).digest('hex');
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('unique_filename', uniqueFilename);
  form.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Cloudinary upload failed');
  return payload.secure_url;
}

async function migrateRows(client, { label, table, column, folder, where = '' }) {
  const rows = await client.query(`SELECT id, ${column} AS url FROM ${table} ${where}`);
  let migrated = 0;
  let skipped = 0;
  for (const row of rows.rows) {
    if (!shouldMigrateUrl(row.url)) continue;
    try {
      const secureUrl = await uploadToCloudinary(row.url, folder);
      await client.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [secureUrl, row.id]);
      migrated += 1;
      if (migrated % 10 === 0) console.log(`[${label}] migrated ${migrated} image(s)...`);
    } catch (err) {
      skipped += 1;
      console.warn(`[${label}] skipped ${row.id}: ${err.message}`);
    }
  }
  if (skipped > 0) console.warn(`[${label}] skipped ${skipped} invalid/non-direct image URL(s).`);
  return migrated;
}

async function run() {
  const databaseUrl = requiredEnv('DATABASE_URL');
  requiredEnv('CLOUDINARY_CLOUD_NAME');
  requiredEnv('CLOUDINARY_API_KEY');
  requiredEnv('CLOUDINARY_API_SECRET');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const counts = [];
    counts.push(await migrateRows(client, { label: 'product_images', table: 'product_images', column: 'url', folder: 'products' }));
    counts.push(await migrateRows(client, { label: 'categories', table: 'categories', column: 'image_url', folder: 'categories', where: 'WHERE image_url IS NOT NULL' }));
    counts.push(await migrateRows(client, { label: 'banners', table: 'banners', column: 'image_url', folder: 'banners', where: 'WHERE image_url IS NOT NULL' }));
    counts.push(await migrateRows(client, { label: 'shop_logo', table: 'shop_profile', column: 'logo_url', folder: 'logo', where: 'WHERE logo_url IS NOT NULL' }));
    console.log(`Done. Migrated ${counts.reduce((sum, count) => sum + count, 0)} image references.`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Image migration failed:', err);
  process.exit(1);
});
