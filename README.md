# SVAYIRO App

SVAYIRO is a production-oriented grocery and daily essentials commerce app with a customer storefront, admin console, POS billing, inventory, orders, coupons, notifications, reviews, complaints, and PostgreSQL-backed workflows.

## Local Development

Prerequisites:

- Node.js 20+
- PostgreSQL

Install dependencies:

```bash
npm install
```

Create and configure `.env` from `.env.example`, then initialize the database:

```bash
npm run db:init
npm run db:seed-admin
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Docker

Start the app with PostgreSQL:

```bash
npm run docker:up
```

Stop services:

```bash
npm run docker:down
```

## Production Notes

- Do not commit `.env`.
- Use a managed PostgreSQL database for production.
- Use Cloudinary or similar object storage for uploaded images.
- Set strong production secrets in the hosting provider environment variables.
- Run `npm run build` before deployment checks.
