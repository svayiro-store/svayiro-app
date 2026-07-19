

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Initialize the local PostgreSQL schema:
   `npm run db:init`
3. Run the app:
   `npm run dev`

## Run with Docker

1. Build and start the app with the database:
   `npm run docker:up`
2. Stop the services:
   `npm run docker:down`

The app is exposed on `http://localhost:3000`, and the PostgreSQL database is available on `localhost:5432`.

If you need to seed the default admin user inside Docker, set `SEED_ADMIN=true` in your local environment before starting the container.
