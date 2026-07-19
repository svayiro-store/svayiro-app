<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1e1e2c71-eaab-4d84-aac1-4b507f90286f

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Initialize the local PostgreSQL schema:
   `npm run db:init`
4. Run the app:
   `npm run dev`

## Run with Docker

1. Build and start the app with the database:
   `npm run docker:up`
2. Stop the services:
   `npm run docker:down`

The app is exposed on `http://localhost:3000`, and the PostgreSQL database is available on `localhost:5432`.

If you need to seed the default admin user inside Docker, set `SEED_ADMIN=true` in your local environment before starting the container.
