FROM node:24-alpine AS base

# Pin pnpm@9 — lockfileVersion: 9.0; pnpm v10 blocks postinstall scripts by default
RUN npm install -g pnpm@9

WORKDIR /app

# Copy manifests + npmrc first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/strikerx/package.json artifacts/strikerx/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy all source
COPY . .

# Build: generate API types → build React frontend → compile API server
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/strikerx run build
RUN pnpm --filter @workspace/api-server run build

EXPOSE 5000

# Run the compiled artifact directly — not via pnpm, so SIGTERM reaches the process
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
