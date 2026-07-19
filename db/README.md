SVAYIRO Database schema

This folder contains the initial PostgreSQL schema for SVAYIRO.

Quick start (local):

1. Install Postgres (or use Docker).
2. Create a database and enable extensions used by schema if needed.

Example with Docker:

```bash
docker run --name svayiro-postgres -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=svayiro -p 5432:5432 -d postgres:15
```

Apply schema:

```bash
psql -h localhost -p 5432 -U postgres -d svayiro -f db/schema.sql
```

Recommended next steps:
- Add migrations (eg. using Flyway, Liquibase, or node-pg-migrate).
- Add Docker Compose to wire Postgres + API + storage (S3/MinIO).
- Create seed scripts for initial shop profile, sample categories, and products.

Notes:
- The schema uses JSONB for flexible fields (addresses, metadata).
- Stock protection should be implemented at the API layer using DB transactions and "SELECT ... FOR UPDATE" or by using an atomic UPDATE with a WHERE stock_count >= desired.
