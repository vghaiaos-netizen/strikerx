FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm run build

CMD ["node", "dist/index.mjs"]
