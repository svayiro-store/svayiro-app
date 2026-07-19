FROM node:20 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_PUBLIC_APP_URL
ARG VITE_GOOGLE_MAPS_BROWSER_KEY
ARG VITE_GOOGLE_MAPS_PLATFORM_KEY
ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
ENV VITE_GOOGLE_MAPS_BROWSER_KEY=$VITE_GOOGLE_MAPS_BROWSER_KEY
ENV VITE_GOOGLE_MAPS_PLATFORM_KEY=$VITE_GOOGLE_MAPS_PLATFORM_KEY
RUN npm run build

FROM node:20 AS runner
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
