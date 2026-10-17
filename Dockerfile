# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json metadata.json ./
COPY public ./public
COPY src ./src
COPY server.ts ./
COPY server ./server
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
# PDF upload launches background jobs with `npx tsx scripts/...` (pre-generation, guided-lesson generation).
# They need the sources and tsx at runtime; tsx is a devDependency, so add just that one package.
RUN npm install --no-save --no-package-lock tsx@"$(node -p "require('./package.json').devDependencies.tsx.replace(/^[^0-9]*/, '')")" && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY server ./server

# Writable data dir for any local fallbacks (sessions / uploads)
RUN mkdir -p /app/data /app/logs /tmp/pt-uploads && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
