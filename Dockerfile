# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json metadata.json ./
COPY public ./public
COPY src ./src
COPY server.ts ./
COPY firebase-config.json ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Do not enable Vertex enterprise routing for AQ.*/AI Studio Live keys
ENV GOOGLE_GENAI_USE_ENTERPRISE=false
ENV LIVE_MODEL=gemini-3.8-live

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Writable data dir for any local fallbacks (sessions / uploads)
RUN mkdir -p /app/data /app/logs /tmp/pt-uploads && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
