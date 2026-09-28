FROM node:24.13.0-bookworm-slim AS build
WORKDIR /app
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json vite.config.ts vitest.config.ts index.html ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY public ./public
RUN npm run build

FROM node:24.13.0-bookworm-slim AS runtime
LABEL org.opencontainers.image.source=https://github.com/nachtschatt3n/splitfairy \
      org.opencontainers.image.description="Splitfairy - so we split fairly" \
      org.opencontainers.image.licenses=MIT
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data SHARP_IGNORE_GLOBAL_LIBVIPS=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "dist/server/apps/server/src/index.js"]
