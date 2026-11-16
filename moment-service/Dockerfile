FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@12.4.1
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @loccoc/common build && pnpm --filter moment-service build
ENV NODE_ENV=production
USER node
WORKDIR /repo/moment-service
EXPOSE 8088
CMD ["node", "dist/main.js"]
