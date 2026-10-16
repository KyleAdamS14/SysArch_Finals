# ---- base: install everything, copy the code ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tests ./tests

# ---- test: Jenkins runs `docker build --target test`; failing tests fail the build ----
FROM base AS test
RUN npm test

# ---- production: small image, no dev files, non-root ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:3000/health || exit 1
USER node
CMD ["node", "src/server.js"]
