FROM node:20-alpine

WORKDIR /app

# Build tools required to compile native Node addons (bufferutil, utf-8-validate, etc.)
RUN apk add --no-cache python3 make g++

RUN npm install -g pnpm@9

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm run build

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
