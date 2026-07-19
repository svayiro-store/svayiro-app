Docker compose for SVAYIRO

This repository includes a `docker-compose.yml` that runs:

- `db` - Postgres 15 with DB data persisted in a volume
- `app` - Node app built from this repository

Quick start:

```bash
# Build and start in background
npm run docker:up

# Tail logs
docker-compose logs -f

# Stop and remove
npm run docker:down
```

Notes:
- `db/schema.sql` will be applied on first container start via `docker-entrypoint-initdb.d`.
- Set production env vars in a `.env` file or pass via docker-compose overrides.
- For development, you may prefer running the app locally with `npm run dev` and Postgres in Docker.
