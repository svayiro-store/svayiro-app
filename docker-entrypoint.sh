#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

wait_for_db() {
  echo "Waiting for database at $DATABASE_URL..."
  until node - <<'NODE'
    import pg from 'pg';
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, idleTimeoutMillis: 1000 });
    try {
      const client = await pool.connect();
      client.release();
      await pool.end();
      process.exit(0);
    } catch (err) {
      await pool.end();
      process.exit(1);
    }
NODE
  do
    echo "Database unavailable, retrying in 2 seconds..."
    sleep 2
  done
}

wait_for_db

echo "Database is available"

echo "Ensuring database schema is initialized..."
npm run db:init

if [ "${SEED_ADMIN:-false}" = "true" ]; then
  echo "Running admin seed script..."
  npm run db:seed-admin
fi

exec npm run start
